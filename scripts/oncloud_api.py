"""A few lines of OnCloud's API for the setup scripts: one call, its answer's data, and a sign-in that asks for the
two-factor code when the account has one (platform staff do)."""
import getpass
import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get('ONCLOUD_API', 'http://127.0.0.1:8000').rstrip('/') + '/api/v1'
APP_URL = os.environ.get('APP_URL', 'http://127.0.0.1:5182').rstrip('/')


def call(method, path, token=None, body=None):
    # A named client: Cloudflare in front of OnCloud refuses Python's default signature (error 1010).
    headers = {'Accept': 'application/json', 'Origin': APP_URL, 'User-Agent': 'oncloud-proposal-builder-setup/1.0'}
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


def sign_in(email, password, who='sign in'):
    status, body = call('POST', '/login', body={'email': email, 'password': password})
    data = ok((status, body), who)
    if body.get('code_key') == 'auth.2fa_challenge':
        code = getpass.getpass(f'{who}: two-factor code for {email}: ').strip()
        data = ok(call('POST', '/login/2fa', body={'challenge_token': data['challenge_token'], 'code': code}), f'{who} (code)')
    return data['access_token']
