import urllib.request
import json

def test():
    # Login admin
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/v1/auth/login',
        data=json.dumps({'username': 'admin', 'password': 'admin123'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    res = json.loads(urllib.request.urlopen(req).read().decode())
    print('Admin Login OK, Token:', res['access_token'][:15], 'Role:', res['user']['role'])
    token = res['access_token']

    # Get /me
    req_me = urllib.request.Request(
        'http://127.0.0.1:8000/api/v1/auth/me',
        headers={'Authorization': f'Bearer {token}'}
    )
    res_me = json.loads(urllib.request.urlopen(req_me).read().decode())
    print('/me Admin OK:', res_me['username'], res_me['role'])

    # Login operator
    req_op = urllib.request.Request(
        'http://127.0.0.1:8000/api/v1/auth/login',
        data=json.dumps({'username': 'operator', 'password': 'operator123'}).encode(),
        headers={'Content-Type': 'application/json'}
    )
    res_op = json.loads(urllib.request.urlopen(req_op).read().decode())
    print('Operator Login OK, Role:', res_op['user']['role'])

    # Test invalid login
    try:
        req_bad = urllib.request.Request(
            'http://127.0.0.1:8000/api/v1/auth/login',
            data=json.dumps({'username': 'admin', 'password': 'wrongpassword'}).encode(),
            headers={'Content-Type': 'application/json'}
        )
        urllib.request.urlopen(req_bad)
        print('ERROR: Wrong password accepted!')
    except urllib.error.HTTPError as e:
        print('Bad login correctly rejected with HTTP', e.code)

if __name__ == '__main__':
    test()

