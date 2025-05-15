VENV ?= .venv
PYTHON := $(VENV)/bin/python

.PHONY: venv demo clean

venv:
	python3 -m venv $(VENV)
	$(PYTHON) -m pip install -r requirements.txt

demo: venv
	$(PYTHON) scripts/main.py --demo

clean:
	rm -rf $(VENV) output/ graph.db
