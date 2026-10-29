"""Make the Proposal Builder OnCloud's public app, sold in a package (README, "Offer it to other workspaces").

Three steps, each by the person who may do it. Before them, register the app in OnCloud's own workspace with
local-setup.py (no --sample) as that workspace's admin, and put the client id it prints in public/config.json.

    submit       OnCloud's workspace admin: submits the app for review (needs PRIVACY_URL, https).
    approve      Platform staff: approves the waiting review (every checklist item confirmed), puts the app in the
                 `apps.proposal_builder` package and, with GRANT_TENANT=<workspace public id>, grants it to one.
    switch-test  The test workspace's admin: installs the public app with blind mode on costs, then revokes the
                 workspace's own private copy, so one Proposal Builder is left and its quote links point to it.

    ONCLOUD_API=https://api.oncloud.om APP_URL=https://proposals.oncloud.om python3 scripts/release-public.py submit
"""
import getpass
import json
import os
import sys

from oncloud_api import call, ok, sign_in

NAME = 'Proposal Builder'
PACKAGE = 'apps.proposal_builder'
CHECKLIST = ['minimal_scopes', 'origins', 'privacy_notice', 'data_retention', 'sensitive_fields']


def account(role):
    email = os.environ.get('EMAIL') or input(f'{role} email: ').strip()
    password = os.environ.get('PASSWORD') or getpass.getpass(f'{role} password: ')
    return sign_in(email, password, role)


def own_app(token):
    apps = [a for a in ok(call('GET', '/connected-apps?per_page=100', token), 'list apps') if a['name'] == NAME and a.get('status') != 'revoked']
    if not apps:
        sys.exit(f'No app named {NAME} in this workspace: run local-setup.py as its admin first.')
    return apps[0]


def submit():
    privacy = os.environ.get('PRIVACY_URL') or input('Privacy notice URL (https): ').strip()
    token = account("OnCloud's workspace admin")
    app = own_app(token)
    review = ok(call('POST', f"/connected-apps/{app['public_id']}/review", token, {
        'privacy_url': privacy,
        'notes': 'Proposal Builder: proposals from the workspace\'s contacts, products and quotes. Costs are sensitive '
                 'fields under blind mode (blind_exempt_key products.costing.view). Read-only workspace scopes (ADR 0053).',
    }), 'submit for review')
    print(json.dumps({'app': app['public_id'], 'client_id': app.get('client_id'), 'review': review['id'], 'status': review['status']}, indent=1))


def approve():
    token = account('Platform staff')
    waiting = [r for r in ok(call('GET', '/platform/connected-apps/reviews?status=submitted', token), 'reviews') if r.get('app_name') == NAME]
    if not waiting:
        sys.exit(f'No review of {NAME} is waiting: run `submit` first.')
    review = waiting[0]
    print('\n'.join(['Reviewing:', *review.get('snapshot_lines', [])]))
    if input('Approve, every checklist item confirmed? [y/N] ').strip().lower() != 'y':
        sys.exit('Not approved.')
    ok(call('POST', f"/platform/connected-apps/reviews/{review['id']}/decide", token, {
        'decision': 'approve', 'checklist': {item: True for item in CHECKLIST}}), 'approve')
    app = review['app_public_id']
    ok(call('PUT', f'/platform/connected-apps/{app}/package', token, {'entitlement_key': PACKAGE}), 'package')
    out = {'app': app, 'visibility': 'public', 'package': PACKAGE}
    tenant = os.environ.get('GRANT_TENANT', '').strip()
    if tenant:
        ok(call('POST', f'/platform/tenants/{tenant}/entitlements', token, {'key': PACKAGE}), f'grant to {tenant}')
        out['granted_to'] = tenant
    print(json.dumps(out, indent=1))


def switch_test():
    token = account("The test workspace's admin")
    listed = ok(call('GET', '/connected-installs/available', token), 'available apps')
    public = next((a for a in listed if a['name'] == NAME and not a['owned']), None)
    if public is None:
        sys.exit(f'The public {NAME} is not offered to this workspace: approve it and grant {PACKAGE} first.')
    if public['install_state'] != 'installed':
        ok(call('POST', f"/connected-installs/{public['public_id']}", token), 'install')
    ok(call('PUT', f"/connected-installs/{public['public_id']}/settings", token,
            {'blind_mode': True, 'blind_exempt_key': 'products.costing.view'}), 'blind mode on costs')
    private = [a for a in ok(call('GET', '/connected-apps?per_page=100', token), 'list apps') if a['name'] == NAME and a.get('status') != 'revoked']
    for a in private:
        ok(call('DELETE', f"/connected-apps/{a['public_id']}", token), f"revoke the private copy {a['public_id']}")
    print(json.dumps({'installed': public['public_id'], 'revoked': [a['public_id'] for a in private]}, indent=1))


STEPS = {'submit': submit, 'approve': approve, 'switch-test': switch_test}
if len(sys.argv) != 2 or sys.argv[1] not in STEPS:
    sys.exit(__doc__)
STEPS[sys.argv[1]]()
