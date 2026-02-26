# st2stack — targets for Codex/test oracle (AGENTS.md)
# Requires: Node 18+, npm. Run `npm install` and `npm install` in packages/ir-types first.

.PHONY: help install lint test typecheck validate-ir validate-fixture

help:
	@echo "Targets:"
	@echo "  install           - install dependencies (root + packages)"
	@echo "  lint              - run linter"
	@echo "  typecheck         - run TypeScript checks"
	@echo "  test              - run unit tests"
	@echo "  validate-ir       - validate IR schema"
	@echo "  validate-fixture  - ensure fixture IR matches golden output"

install:
	npm install
	cd packages/ir-types && npm install

lint:
	cd packages/ir-types && npm run lint

typecheck:
	cd packages/ir-types && npm run typecheck

test:
	npm run test

validate-ir:
	npm run validate-ir

validate-fixture:
	npm run validate-fixture
	