"""Modal deployment for the CoolBid Floor Plan Analyzer.

Deploy with: modal deploy modal_app.py
Run locally with: modal serve modal_app.py
"""
import modal

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi>=0.115",
        "uvicorn[standard]>=0.34",
        "python-multipart>=0.0.9",
        "opencv-python-headless>=4.10",
        "numpy>=2.0",
        "pydantic>=2.10",
        "anthropic>=0.39",
        "shapely>=2.0",
        "Pillow>=11.0",
    )
    .add_local_dir("app", remote_path="/root/app")
)

app = modal.App("coolbid-analyzer", image=image)


@app.function(
    timeout=300,
    secrets=[modal.Secret.from_name("anthropic")],
)
@modal.asgi_app()
def fastapi_app():
    from app.main import app
    return app
