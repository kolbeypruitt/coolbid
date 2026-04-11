"""Modal deployment for the CoolBid Geometry Service.

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
    )
    .pip_install(
        "torch>=2.7",
    )
    .apt_install("git")
    .run_commands(
        # SAM 3 has undeclared deps (einops, pycocotools, psutil)
        "pip install einops pycocotools psutil",
        # SAM 2 (open access, automatic masks — fallback)
        "pip install git+https://github.com/facebookresearch/sam2.git",
        # SAM 3 (gated, text-prompted — primary)
        "pip install git+https://github.com/facebookresearch/sam3.git",
    )
    .add_local_dir("app", remote_path="/root/app")
)

app = modal.App("coolbid-geometry", image=image)


@app.function(gpu="A10G", timeout=120, secrets=[modal.Secret.from_name("huggingface")])
@modal.asgi_app()
def fastapi_app():
    from app.main import app
    return app
