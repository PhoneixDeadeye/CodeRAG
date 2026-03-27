#!/usr/bin/env python3
"""
CodeRAG Quick Start Script

This script automates the initial setup and verification of CodeRAG.
Run this after cloning the repository to ensure everything is configured correctly.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# Color codes for terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
RESET = "\033[0m"
BOLD = "\033[1m"


def print_header(text):
    """Print a formatted header."""
    print(f"\n{BOLD}{BLUE}{'=' * 60}{RESET}")
    print(f"{BOLD}{BLUE}{text.center(60)}{RESET}")
    print(f"{BOLD}{BLUE}{'=' * 60}{RESET}\n")


def print_success(text):
    """Print success message."""
    print(f"{GREEN}✓{RESET} {text}")


def print_warning(text):
    """Print warning message."""
    print(f"{YELLOW}⚠{RESET} {text}")


def print_error(text):
    """Print error message."""
    print(f"{RED}✗{RESET} {text}")


def print_info(text):
    """Print info message."""
    print(f"{BLUE}ℹ{RESET} {text}")


def check_command(cmd):
    """Check if a command is available."""
    return shutil.which(cmd) is not None


def run_command(cmd, description, cwd=None):
    """Run a shell command and report status."""
    print_info(f"{description}...")
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd, capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0:
            print_success(f"{description} - OK")
            return True
        else:
            print_error(f"{description} - Failed")
            if result.stderr:
                print(f"  Error: {result.stderr[:200]}")
            return False
    except subprocess.TimeoutExpired:
        print_error(f"{description} - Timeout")
        return False
    except Exception as e:
        print_error(f"{description} - {str(e)}")
        return False


def check_prerequisites():
    """Check if all prerequisites are installed."""
    print_header("Checking Prerequisites")

    all_good = True

    # Python
    if sys.version_info >= (3, 10):
        print_success(
            f"Python {sys.version_info.major}.{sys.version_info.minor} installed"
        )
    else:
        print_error(
            f"Python 3.10+ required (found {sys.version_info.major}.{sys.version_info.minor})"
        )
        all_good = False

    # Node.js
    if check_command("node"):
        result = subprocess.run(
            "node --version", shell=True, capture_output=True, text=True
        )
        version = result.stdout.strip()
        print_success(f"Node.js {version} installed")
    else:
        print_error("Node.js not found (required for frontend)")
        all_good = False

    # npm
    if check_command("npm"):
        result = subprocess.run(
            "npm --version", shell=True, capture_output=True, text=True
        )
        version = result.stdout.strip()
        print_success(f"npm {version} installed")
    else:
        print_error("npm not found")
        all_good = False

    # Git
    if check_command("git"):
        result = subprocess.run(
            "git --version", shell=True, capture_output=True, text=True
        )
        version = result.stdout.strip()
        print_success(f"{version} installed")
    else:
        print_error("Git not found (required for repository cloning)")
        all_good = False

    # Docker (optional)
    if check_command("docker"):
        result = subprocess.run(
            "docker --version", shell=True, capture_output=True, text=True
        )
        version = result.stdout.strip()
        print_success(f"{version} installed")
    else:
        print_warning(
            "Docker not found (optional, needed for containerized deployment)"
        )

    return all_good


def setup_environment():
    """Set up environment file."""
    print_header("Environment Setup")

    env_path = Path(".env")
    env_example_path = Path(".env.example")

    if env_path.exists():
        print_warning(".env file already exists")
        response = input("  Overwrite? (y/N): ").strip().lower()
        if response != "y":
            print_info("Keeping existing .env file")
            return True

    if env_example_path.exists():
        shutil.copy(env_example_path, env_path)
        print_success("Created .env from template")

        print("\n" + "=" * 60)
        print_warning("IMPORTANT: You must configure your .env file!")
        print("=" * 60)
        print("\nRequired configuration:")
        print("  1. GOOGLE_API_KEY - Get from https://aistudio.google.com/app/apikey")
        print(
            '  2. SECRET_KEY - Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
        )
        print("\nOptional configuration:")
        print("  - CORS_ORIGINS")
        print("  - LOG_LEVEL")
        print("  - CHAT_RATE_LIMIT")
        print("\n" + "=" * 60 + "\n")

        response = input("Open .env file now for editing? (Y/n): ").strip().lower()
        if response != "n":
            # Try to open with default editor
            if sys.platform == "win32":
                os.system(f'notepad "{env_path}"')
            else:
                os.system(f'${os.environ.get("EDITOR", "nano")} "{env_path}"')

        return True
    else:
        print_error(".env.example not found")
        return False


def install_backend_dependencies():
    """Install Python dependencies."""
    print_header("Backend Setup")

    # Check if virtual environment exists
    venv_path = Path("venv")
    if not venv_path.exists():
        print_info("Creating virtual environment...")
        if run_command(f"{sys.executable} -m venv venv", "Create venv"):
            print_success("Virtual environment created")
        else:
            print_error("Failed to create virtual environment")
            return False

    # Determine activation command
    if sys.platform == "win32":
        pip_cmd = "venv\\Scripts\\pip"
    else:
        pip_cmd = "venv/bin/pip"

    # Install dependencies
    return run_command(
        f"{pip_cmd} install -r requirements.txt", "Installing Python dependencies"
    )


def install_frontend_dependencies():
    """Install Node.js dependencies."""
    print_header("Frontend Setup")

    frontend_path = Path("frontend")
    if not frontend_path.exists():
        print_error("frontend directory not found")
        return False

    return run_command(
        "npm install", "Installing Node.js dependencies", cwd=str(frontend_path)
    )


def create_directories():
    """Create necessary directories."""
    print_header("Creating Directories")

    directories = ["data", "data/users", "data/guests", "logs", "vectorstore"]

    for dir_path in directories:
        Path(dir_path).mkdir(parents=True, exist_ok=True)
        print_success(f"Created {dir_path}/")

    return True


def verify_setup():
    """Verify the setup is correct."""
    print_header("Verification")

    checks = []

    # Check .env file
    if Path(".env").exists():
        print_success(".env file exists")
        checks.append(True)

        # Check if GOOGLE_API_KEY is set
        with open(".env", "r") as f:
            content = f.read()
            if "GOOGLE_API_KEY=your_google_api_key_here" in content:
                print_warning("GOOGLE_API_KEY not configured in .env")
                checks.append(False)
            elif "GOOGLE_API_KEY=" in content:
                print_success("GOOGLE_API_KEY is set")
                checks.append(True)
            else:
                print_warning("GOOGLE_API_KEY not found in .env")
                checks.append(False)
    else:
        print_error(".env file missing")
        checks.append(False)

    # Check venv
    if Path("venv").exists():
        print_success("Virtual environment exists")
        checks.append(True)
    else:
        print_warning("Virtual environment not found")
        checks.append(False)

    # Check node_modules
    if Path("frontend/node_modules").exists():
        print_success("Frontend dependencies installed")
        checks.append(True)
    else:
        print_warning("Frontend dependencies not installed")
        checks.append(False)

    return all(checks)


def print_next_steps():
    """Print instructions for next steps."""
    print_header("Next Steps")

    print("Backend:")
    if sys.platform == "win32":
        print("  1. Activate virtual environment:")
        print("     venv\\Scripts\\activate")
        print("  2. Start the backend:")
        print("     uvicorn app.api.main:app --reload --host 0.0.0.0 --port 8000")
    else:
        print("  1. Activate virtual environment:")
        print("     source venv/bin/activate")
        print("  2. Start the backend:")
        print("     uvicorn app.api.main:app --reload --host 0.0.0.0 --port 8000")

    print("\nFrontend (in a new terminal):")
    print("  1. Navigate to frontend:")
    print("     cd frontend")
    print("  2. Start the dev server:")
    print("     npm run dev")

    print("\nAccess the application:")
    print("  - Frontend: http://localhost:5173")
    print("  - Backend API: http://localhost:8000")
    print("  - API Docs: http://localhost:8000/docs")

    print("\nDocumentation:")
    print("  - README.md - Getting started guide")
    print("  - API_DOCS.md - API reference")
    print("  - DEPLOYMENT.md - Production deployment")
    print("  - PROJECT_COMPLETION.md - Project overview")

    print("\nMaintenance:")
    print("  - Run maintenance script:")
    print("    python maintenance.py")


def main():
    """Main setup flow."""
    print(f"\n{BOLD}{GREEN}")
    print("╔════════════════════════════════════════════════════════╗")
    print("║                                                        ║")
    print("║              CodeRAG Quick Start Setup                 ║")
    print("║                                                        ║")
    print("╚════════════════════════════════════════════════════════╝")
    print(RESET)

    print("This script will:")
    print("  • Check prerequisites")
    print("  • Set up environment configuration")
    print("  • Install backend dependencies")
    print("  • Install frontend dependencies")
    print("  • Create necessary directories")
    print("  • Verify the setup")

    input("\nPress Enter to continue...")

    # Run setup steps
    steps = [
        (check_prerequisites, "Prerequisites check"),
        (setup_environment, "Environment setup"),
        (create_directories, "Directory creation"),
        (install_backend_dependencies, "Backend installation"),
        (install_frontend_dependencies, "Frontend installation"),
        (verify_setup, "Verification"),
    ]

    for step_func, step_name in steps:
        if not step_func():
            print_error(f"\n{step_name} failed!")
            print("\nSetup incomplete. Please fix the errors and try again.")
            sys.exit(1)

    # Success!
    print_header("Setup Complete!")
    print_success("CodeRAG is ready to use!")

    print_next_steps()

    print(f"\n{BOLD}{GREEN}Happy coding! 🚀{RESET}\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n{YELLOW}Setup cancelled by user{RESET}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n{RED}Unexpected error: {e}{RESET}\n")
        sys.exit(1)
