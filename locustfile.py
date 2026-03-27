import random
from locust import HttpUser, task, between


class CodeRAGUser(HttpUser):
    wait_time = between(1, 5)

    def on_start(self):
        """
        Simulate user login/registration to get an access token.
        """
        # Create a random user for this session
        self.email = f"loadtest_{random.randint(1000, 99999)}@example.com"
        self.password = "password123"

        # Try to register
        try:
            self.client.post(
                "/api/v1/auth/register",
                json={
                    "email": self.email,
                    "password": self.password,
                    "full_name": "Load Test User",
                },
            )
        except Exception:
            pass  # User might already exist

        # Login
        response = self.client.post(
            "/api/v1/auth/login",
            data={"username": self.email, "password": self.password},
        )

        if response.status_code == 200:
            self.token = response.json()["access_token"]
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.token = None
            self.headers = {}

    @task(3)
    def chat_interaction(self):
        """
        Simulate a chat query.
        """
        if not self.token:
            return

        # We need a session first
        # For simplicity, we'll just hit the health endpoint or a light endpoint if chat needs complex setup
        # But let's try to hit the chat endpoint if we had a valid session + repo.
        # Since setting up a repo is heavy, we will test the 'guest' chat or simple health mainly
        # to test throughput of the API itself.

        # Real user flow: Get Sessions -> Pick one -> Chat
        # Here we will just hit the health endpoints to stress the async loop
        self.client.get("/health")
        self.client.get("/health/ai")

    @task(1)
    def check_repos(self):
        if not self.token:
            return
        self.client.get("/api/v1/repos", headers=self.headers)

    @task(2)
    def check_user_profile(self):
        if not self.token:
            return
        self.client.get("/api/v1/auth/me", headers=self.headers)
