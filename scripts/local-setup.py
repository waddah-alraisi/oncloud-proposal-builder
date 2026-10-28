"""Set the Proposal Builder up against a local OnCloud (README, "Run it locally").

Signs in as the workspace admin, registers the app (or updates it), publishes schema/proposal-builder.schema.json,
turns blind mode on for the costing (only `products.costing.view` holders see it), and — with --sample — adds a
client, two products with prices, a quote and an exchange rate to try the links with. Prints the client id for
public/config.json and an app token for the console when sign-in cannot come back to 127.0.0.1.

    ONCLOUD_API=http://127.0.0.1:8000 APP_URL=http://127.0.0.1:5182 ADMIN_EMAIL=… ADMIN_PASSWORD=… \
        python3 scripts/local-setup.py [--sample]
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get('ONCLOUD_API', 'http://127.0.0.1:8000').rstrip('/') + '/api/v1'
APP_URL = os.environ.get('APP_URL', 'http://127.0.0.1:5182').rstrip('/')
EMAIL = os.environ.get('ADMIN_EMAIL', 'sara@demo.oncloud.example')
PASSWORD = os.environ.get('ADMIN_PASSWORD', os.environ.get('DEMO_PASSWORD', ''))
HERE = os.path.dirname(os.path.abspath(__file__))
NAME = 'Proposal Builder'
SCOPES = ['identity:read', 'data:rw', 'drive:rw', 'contacts:r', 'products:r', 'sales:r']


def call(method, path, token=None, body=None):
    headers = {'Accept': 'application/json', 'Origin': APP_URL}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(API + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def ok(result, what):
    status, body = result
    if status != 200:
        sys.exit(f'{what}: {status} {json.dumps(body)[:600]}')
    return body['data']


admin = ok(call('POST', '/login', body={'email': EMAIL, 'password': PASSWORD}), 'sign in')['access_token']

apps = ok(call('GET', '/connected-apps?per_page=100', admin), 'list apps')
mine = [a for a in apps if a['name'] == NAME]
spec = {'launch_url': APP_URL + '/', 'allowed_origins': [APP_URL], 'redirect_uris': [APP_URL + '/callback'], 'scopes': SCOPES}
if mine:
    app = ok(call('PATCH', f"/connected-apps/{mine[0]['public_id']}", admin, spec), 'update app')
else:
    app = ok(call('POST', '/connected-apps', admin, {'name': NAME, 'tier': 'full', 'icon': 'file', **spec}), 'register app')
aid = app['public_id']

schema = json.load(open(os.path.join(HERE, '..', 'schema', 'proposal-builder.schema.json')))
ok(call('POST', f'/connected-apps/{aid}/schemas/draft/start', admin), 'start a schema draft') if mine else None
ok(call('PUT', f'/connected-apps/{aid}/schemas/draft', admin, {'document': schema}), 'save the schema draft')
version = max([v.get('version', 0) for v in ok(call('GET', f'/connected-apps/{aid}/schemas', admin), 'schemas')] or [1])
status, body = call('POST', f'/connected-apps/{aid}/schemas/{version}/publish', admin)
if status != 200 and 'nothing' not in json.dumps(body).lower():
    print('publish:', status, json.dumps(body)[:300])

ok(call('PUT', f'/connected-installs/{aid}/settings', admin, {'blind_mode': True, 'blind_exempt_key': 'products.costing.view'}), 'blind mode on costs')

state = {'app': aid, 'client_id': app.get('client_id')}

if '--sample' in sys.argv:
    def first(path, key, value):
        rows = ok(call('GET', path, admin), path)
        return next((r for r in rows if r.get(key) == value), None)

    client = first('/contacts?filters[q]=Al%20Manara&per_page=50', 'display_name', 'Al Manara Trading LLC') or ok(call('POST', '/contacts', admin, {
        'contact_type': 'business', 'display_name': {'en': 'Al Manara Trading LLC', 'ar': 'المنارة للتجارة'}, 'primary_email': 'finance@almanara.test'}), 'client')
    lists = ok(call('GET', '/price-lists?per_page=50', admin), 'price lists')
    plist = next((p for p in lists if p.get('currency') == 'OMR'), None) or ok(call('POST', '/price-lists', admin, {
        'name': {'en': 'Retail'}, 'code': 'retail-omr', 'currency': 'OMR', 'is_default': True}), 'price list')

    def product(sku, name, price, kind):
        found = first(f'/products?filters[q]={sku}&per_page=50', 'sku', sku)
        if found:
            return found
        p = ok(call('POST', '/products', admin, {'name': {'en': name}, 'sku': sku, 'product_type': kind}), f'product {sku}')
        ok(call('POST', f"/products/{p['public_id']}/prices", admin, {'price_list': plist['public_id'], 'amounts': {'retail_price': price}}), f'price {sku}')
        return p

    plan = product('PB-GROWTH', 'Growth plan, per company per year', 4800000, 'service')
    setup = product('PB-IMPL', 'Implementation and data migration', 2500000, 'service')
    quote = ok(call('POST', '/sales/documents', admin, {'type': 'quote', 'contact': client['public_id'], 'currency': 'OMR', 'lines': [
        {'product': plan['public_id'], 'quantity': 1}, {'product': setup['public_id'], 'quantity': 1}]}), 'quote')
    status, _ = call('POST', '/sales/exchange-rates', admin, {'from_currency': 'USD', 'to_currency': 'OMR', 'rate_date': '2026-10-27', 'rate': '0.3845'})
    state.update({'client': client['public_id'], 'quote': quote['public_id'], 'products': [plan['public_id'], setup['public_id']], 'rate_status': status})

session = call('POST', f'/me/connected-apps/{aid}/session', admin, {'consent': True})
if session[0] == 200:
    state['app_token'] = session[1]['data']['access_token']

print(json.dumps(state, indent=1))
print(f"\npublic/config.json: {{\"api_base\": \"{API[:-7]}\", \"client_id\": \"{state['client_id']}\"}}", file=sys.stderr)
