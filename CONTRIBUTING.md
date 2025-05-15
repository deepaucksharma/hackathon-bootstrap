# Contributing to MicroLink

Thank you for your interest in contributing to MicroLink! This document provides guidelines and instructions for contributing to the project.

## Development Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-dir>
```

2. Create a virtual environment and install dependencies:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

3. Set up your environment:
```bash
cp .env.example .env
# Edit .env with your API keys
```

## Implementation Plan

The project is divided into 5 phases. If you're contributing, please refer to the specific phase documentation:

1. [Phase 1: Repo Setup](docs/PHASE1_REPO_SETUP.md)
2. [Phase 2: Extract & Normalize](docs/PHASE2_EXTRACT_NORMALIZE.md)
3. [Phase 3: Graph & Visualization](docs/PHASE3_GRAPH_VISUALIZATION.md)
4. [Phase 4: Policy & Neo4j](docs/PHASE4_POLICY_NEO4J.md)
5. [Phase 5: Streaming & PR](docs/PHASE5_STREAMING_PR.md)

## Running Tests

Run the demo pipeline to verify your changes:
```bash
make demo
```

## Coding Standards

- Follow PEP 8 style guidelines
- Include docstrings for all modules and functions
- Add type hints where possible
- Keep code modular and maintainable

## Pull Request Process

1. Create a new branch for your feature
2. Make your changes and test them
3. Submit a pull request with a clear description of the changes
4. Ensure all CI checks pass

## Feature Requests and Bug Reports

Use the GitHub Issues tracker to report bugs or request new features. Please include:

- A clear description of the issue or feature
- Steps to reproduce (for bugs)
- Expected vs. actual behavior (for bugs)
- Any relevant logs or screenshots

## License

By contributing to MicroLink, you agree that your contributions will be licensed under the project's MIT License.
