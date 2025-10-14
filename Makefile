# LCAI DAO Smart Contract Makefile
# =================================

# Default network
NETWORK ?= lcaiTestnet

# Colors for output
GREEN = \033[0;32m
YELLOW = \033[1;33m
RED = \033[0;31m
NC = \033[0m # No Color

.PHONY: help install compile deploy-all deploy-dao deploy-chat-utility clean test verify

# Default target
help:
	@echo "$(GREEN)LCAI DAO Smart Contract Commands$(NC)"
	@echo "=================================="
	@echo ""
	@echo "$(YELLOW)Setup:$(NC)"
	@echo "  install          Install dependencies"
	@echo "  compile          Compile contracts"
	@echo ""
	@echo "$(YELLOW)Deployment:$(NC)"
	@echo "  deploy-all       Deploy all contracts (DAO + Chat Utility)"
	@echo "  deploy-dao       Deploy DAO contracts only"
	@echo "  deploy-chat-utility  Deploy Chat Utility contract only"
	@echo ""
	@echo "$(YELLOW)Utilities:$(NC)"
	@echo "  clean            Clean build artifacts"
	@echo "  test             Run tests"
	@echo "  verify           Verify deployed contracts"
	@echo ""
	@echo "$(YELLOW)Network Options:$(NC)"
	@echo "  NETWORK=lcaiTestnet  (default)"
	@echo "  NETWORK=sepolia"
	@echo "  NETWORK=hardhat"
	@echo ""
	@echo "$(YELLOW)Examples:$(NC)"
	@echo "  make deploy-all"
	@echo "  make deploy-dao NETWORK=sepolia"
	@echo "  make deploy-chat-utility NETWORK=lcaiTestnet"

# Install dependencies
install:
	@echo "$(GREEN)Installing dependencies...$(NC)"
	npm install

# Compile contracts
compile:
	@echo "$(GREEN)Compiling contracts...$(NC)"
	npx hardhat compile

# Deploy all contracts (DAO + Chat Utility)
deploy-all: compile
	@echo "$(GREEN)Deploying all contracts to $(NETWORK)...$(NC)"
	npx hardhat run scripts/deploy-smart-contracts.mjs --network $(NETWORK)

# Deploy DAO contracts only
deploy-dao: compile
	@echo "$(GREEN)Deploying DAO contracts to $(NETWORK)...$(NC)"
	npx hardhat run scripts/deploy.ts --network $(NETWORK)

# Deploy Chat Utility contract only
deploy-chat-utility: compile
	@echo "$(GREEN)Deploying Chat Utility contract to $(NETWORK)...$(NC)"
	npx hardhat run scripts/deploy-chat-utility.mjs --network $(NETWORK)

# Clean build artifacts
clean:
	@echo "$(GREEN)Cleaning build artifacts...$(NC)"
	rm -rf artifacts/
	rm -rf cache/
	rm -rf typechain-types/
	rm -rf abi/
	rm -rf data/
	rm -rf lib/
	rm -rf deployments/

# Run tests
test:
	@echo "$(GREEN)Running tests...$(NC)"
	npx hardhat test

# Verify contracts on block explorer
verify:
	@echo "$(GREEN)Verifying contracts...$(NC)"
	@echo "$(YELLOW)Note: Contract addresses need to be updated in this command$(NC)"
	@echo "npx hardhat verify --network $(NETWORK) <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>"

# Development helpers
dev-setup: install compile
	@echo "$(GREEN)Development environment setup complete!$(NC)"
	@echo "$(YELLOW)Next steps:$(NC)"
	@echo "1. Copy .env.example to .env"
	@echo "2. Add your private key to .env"
	@echo "3. Run: make deploy-all"

# Production deployment
prod-deploy: compile
	@echo "$(RED)Production deployment to $(NETWORK)$(NC)"
	@echo "$(YELLOW)Make sure you have:$(NC)"
	@echo "1. Set correct network in .env"
	@echo "2. Verified all contract addresses"
	@echo "3. Tested on testnet first"
	@read -p "Continue with production deployment? [y/N]: " confirm && [ "$$confirm" = "y" ]
	npx hardhat run scripts/deploy-smart-contracts.mjs --network $(NETWORK)

# Show deployment status
status:
	@echo "$(GREEN)Deployment Status$(NC)"
	@echo "=================="
	@echo "Network: $(NETWORK)"
	@echo "Contracts compiled: $$(if [ -d "artifacts" ]; then echo "✅ Yes"; else echo "❌ No"; fi)"
	@echo "ABI files: $$(if [ -d "abi" ]; then echo "✅ Yes"; else echo "❌ No"; fi)"
	@echo "Data files: $$(if [ -d "data" ]; then echo "✅ Yes"; else echo "❌ No"; fi)"
