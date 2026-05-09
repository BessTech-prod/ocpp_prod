import httpx
import sys

def test_whitelist_endpoint():
    url = "http://localhost:8000/api/admin/external/keys/whitelist"
    try:
        # We expect 401 Unauthorized if not authenticated, but NOT 404 Not Found
        response = httpx.post(url, json={
            "org_id": "test",
            "key_hash": "test",
            "ip_whitelist": []
        })
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
        
        if response.status_code == 404:
            print("FAILURE: Endpoint returned 404!")
        else:
            print("SUCCESS: Endpoint exists (returned something other than 404).")
            
    except Exception as e:
        print(f"Error connecting to server: {e}")
        print("Make sure the API service is running locally.")

if __name__ == "__main__":
    test_whitelist_endpoint()
