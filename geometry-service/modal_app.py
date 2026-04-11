"""Modal deployment for the CoolBid Geometry Service.

Deploy with: modal deploy modal_app.py
Run locally with: modal serve modal_app.py
"""
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi>=0.115",
        "uvicorn[standard]>=0.34",
        "python-multipart>=0.0.9",
        "opencv-python-headless>=4.10",
        "numpy>=2.0",
        "pydantic>=2.10",
    )
    .pip_install(
        "torch>=2.5",
        "segment-anything-3>=0.1",
    )
    .run_commands(
        "mkdir -p /models",
        # Download SAM 3 model weights — verify URL against sam3 repo releases
        "python -c \"import urllib.request; urllib.request.urlretrieve("
        "'https://dl.fbaipublicfiles.com/segment_anything_3/sam3_hiera_large.pt', "
        "'/models/sam3_hiera_large.pt')\"",
    )
    .copy_local_dir("app", "/root/app")
)

app = modal.App("coolbid-geometry", image=image)


@app.function(gpu="A10G", timeout=120)
@modal.asgi_app()
def fastapi_app():
    from app.main import app
    return app
