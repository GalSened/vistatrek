"""
VistaTrek Health Check Tests
"""


def test_health_check(client):
    """Test the health check endpoint."""
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "healthy"
    assert data["version"] == "0.1.0"
    assert "timestamp" in data
