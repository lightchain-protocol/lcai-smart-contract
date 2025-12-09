import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "ethers";

const { network } = hre;
let ethers: typeof hre.ethers;
let networkHelpers: any;
let owner: any;
let trainer: any;
let validator1: any;
let validator2: any;
let validator3: any;
let challenger: any;
let treasury: any;

describe("AIVMModelRegistry", function () {
  const TRAINER_STAKE_MIN = parseEther("100");
  const VALIDATOR_STAKE_MIN = parseEther("50");

  before(async function () {
    ({ ethers, networkHelpers } = await network.connect());
    [owner, trainer, validator1, validator2, validator3, challenger, treasury] =
      await ethers.getSigners();
  });

  async function deployModelRegistry() {
    const modelRegistry = await ethers.deployContract("AIVMModelRegistry", [
      treasury.address,
    ]);
    return { modelRegistry };
  }

  describe("Base Model Registration", function () {
    it("Should allow owner to register base model", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel(
        "base-001",
        "QmBaseModelCID123",
        "QmMetadataHash456",
        "v1.0",
        "QmBenchmarkCID789"
      );

      const baseModel = await modelRegistry.getBaseModel("base-001");
      expect(baseModel.modelId).to.equal("base-001");
      expect(baseModel.baseModelCID).to.equal("QmBaseModelCID123");
      expect(baseModel.isActive).to.be.true;
    });

    it("Should reject duplicate base model ID", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel(
        "base-001",
        "QmCID1",
        "QmMeta1",
        "v1.0",
        "QmBench1"
      );

      await expect(
        modelRegistry.registerBaseModel("base-001", "QmCID2", "QmMeta2", "v1.0", "QmBench2")
      ).to.be.revertedWith("Model ID already exists");
    });

    it("Should emit BaseModelRegistered event", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await expect(
        modelRegistry.registerBaseModel(
          "base-001",
          "QmBaseCID",
          "QmMetaHash",
          "v1.0",
          "QmBenchCID"
        )
      )
        .to.emit(modelRegistry, "BaseModelRegistered")
        .withArgs("base-001", "QmBaseCID", "QmMetaHash", "QmBenchCID");
    });
  });

  describe("Variant Submission with Staking", function () {
    it("Should allow trainer to submit variant with sufficient stake", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel(
        "base-001",
        "QmBaseCID",
        "QmMeta",
        "v1.0",
        "QmBench"
      );

      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVariantCID", "QmVarMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      const variant = await modelRegistry.getVariant("var-001");
      expect(variant.variantId).to.equal("var-001");
      expect(variant.trainer).to.equal(trainer.address);
      expect(variant.status).to.equal(0); // Submitted
      expect(variant.trainerStake).to.equal(TRAINER_STAKE_MIN);
    });

    it("Should reject variant with insufficient stake", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");

      const insufficientStake = parseEther("50");

      await expect(
        modelRegistry
          .connect(trainer)
          .registerVariant("var-001", "QmCID", "QmMeta", "base-001", {
            value: insufficientStake,
          })
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should emit ValidationRequested event", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");

      await expect(
        modelRegistry
          .connect(trainer)
          .registerVariant("var-001", "QmVariantCID", "QmMeta", "base-001", {
            value: TRAINER_STAKE_MIN,
          })
      )
        .to.emit(modelRegistry, "ValidationRequested")
        .withArgs("var-001", "QmVariantCID", trainer.address, TRAINER_STAKE_MIN);
    });
  });

  describe("Validator Staking", function () {
    it("Should allow validator to stake for validation", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVariantCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      const stakes = await modelRegistry.getVariantValidators("var-001");
      expect(stakes.length).to.equal(1);
      expect(stakes[0].validator).to.equal(validator1.address);
      expect(stakes[0].amount).to.equal(VALIDATOR_STAKE_MIN);
    });

    it("Should update variant status to Validating", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      const variant = await modelRegistry.getVariant("var-001");
      expect(variant.status).to.equal(1); // Validating
    });

    it("Should reject duplicate validator stake", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      // First stake succeeds
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      // Second stake from same validator should fail (duplicate check)
      await expect(
        modelRegistry
          .connect(validator1)
          .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN })
      ).to.be.revertedWith("Already staked for this variant");
    });
  });

  describe("Validation Result Submission", function () {
    it("Should approve variant with passing score", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });
      
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      const passingScore = 8500; // 85% (above 80% minimum)

      // Update policy to accept 1 validator for testing
      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);

      await modelRegistry.submitValidationResult(
        "var-001",
        passingScore,
        "QmReportCID",
        1
      );

      const variant = await modelRegistry.getVariant("var-001");
      expect(variant.status).to.equal(2); // Approved
      expect(variant.avgScore).to.equal(passingScore);
      expect(variant.challengeWindowOpen).to.be.true;
    });

    it("Should reject variant with failing score", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });
      
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      const failingScore = 7000; // 70% (below 80% minimum)

      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);

      await modelRegistry.submitValidationResult(
        "var-001",
        failingScore,
        "QmReportCID",
        1
      );

      const variant = await modelRegistry.getVariant("var-001");
      expect(variant.status).to.equal(3); // Rejected
      expect(variant.avgScore).to.equal(failingScore);
    });

    it("Should emit ValidationResult event", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });
      
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);

      const score = 8500;

      await expect(
        modelRegistry.submitValidationResult("var-001", score, "QmReport", 1)
      )
        .to.emit(modelRegistry, "ValidationResult")
        .withArgs("var-001", score, true, 1);
    });
  });

  describe("Aggregator & Access Policy Controls", function () {
    it("Should revert aggregated result from non-aggregator", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry.connect(validator1).stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      await expect(
        modelRegistry
          .connect(trainer)
          .submitAggregatedResult("var-001", 9000, "QmReport", 25)
      ).to.be.revertedWith("Caller not aggregator");
    });

    it("Should allow owner to update aggregator", async function () {
      const { modelRegistry } = await deployModelRegistry();
      await modelRegistry.setAggregator(trainer.address);
      expect(await modelRegistry.aggregator()).to.equal(trainer.address);
    });

    it("Should store and retrieve access policy", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.setAccessPolicy("var-001", true, parseEther("10"), validator1.address, 3600);

      const policy = await modelRegistry.getAccessPolicy("var-001");
      expect(policy.requireTicket).to.equal(true);
      expect(policy.minStakeRequired).to.equal(parseEther("10"));
      expect(policy.ticketManager).to.equal(validator1.address);
      expect(policy.ticketTTL).to.equal(3600);
    });
  });

  describe("Score submission helper", function () {
    it("Should derive validator count and emit ScoreSubmitted", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);

      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      await expect(modelRegistry.submitScore("var-001", 9200, "QmReportCID"))
        .to.emit(modelRegistry, "ScoreSubmitted")
        .withArgs("var-001", 9200, "QmReportCID", owner.address, 1);

      const variant = await modelRegistry.getVariant("var-001");
      expect(variant.status).to.equal(2);
      expect(variant.validatorCount).to.equal(1);
    });

    it("Should prevent submitScore from non-aggregator", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      await expect(
        modelRegistry.connect(trainer).submitScore("var-001", 9100, "QmReport")
      ).to.be.revertedWith("Caller not aggregator");
    });
  });

  describe("Decryption Ticket Requests", function () {
    it("Should issue ticket via ticket manager and record receipt", async function () {
      const { modelRegistry } = await deployModelRegistry();
      const ticketManager = await ethers.deployContract("AIVMTicketManager");

      await ticketManager.transferOwnership(await modelRegistry.getAddress());

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      await modelRegistry.submitScore("var-001", 9000, "QmReportTicket");

      await modelRegistry.setAccessPolicy("var-001", true, 0, ticketManager.target, 0);

      await expect(modelRegistry.connect(trainer).requestDecryptionTicket("var-001"))
        .to.emit(modelRegistry, "DecryptionTicketRequested");

      const trainerTickets = await modelRegistry.getAccountTicketIds(trainer.address);
      const ticketId = trainerTickets[trainerTickets.length - 1];

      const receipt = await modelRegistry.getTicketReceipt(ticketId);
      expect(receipt.requester).to.equal(trainer.address);
      expect(receipt.variantId).to.equal("var-001");
      expect(receipt.ticketManager).to.equal(ticketManager.target);

      const variantTickets = await modelRegistry.getVariantTicketIds("var-001");
      expect(variantTickets).to.include(ticketId);
    });

    it("Should revert ticket requests when variant not approved", async function () {
      const { modelRegistry } = await deployModelRegistry();
      const ticketManager = await ethers.deployContract("AIVMTicketManager");
      await ticketManager.transferOwnership(await modelRegistry.getAddress());

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry.setAccessPolicy("var-001", true, 0, ticketManager.target, 600);

      await expect(
        modelRegistry.connect(trainer).requestDecryptionTicket("var-001")
      ).to.be.revertedWith("Variant not accessible");
    });

    it("Should revert when ticket manager address missing", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      await modelRegistry.submitScore("var-001", 9000, "QmReport");

      await modelRegistry.setAccessPolicy("var-001", true, 0, ethers.ZeroAddress, 600);

      await expect(
        modelRegistry.connect(trainer).requestDecryptionTicket("var-001")
      ).to.be.revertedWith("Ticket manager missing");
    });
  });

  describe("Dispute Workflow", function () {
    async function setupApprovedVariant() {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);

      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });

      await modelRegistry.submitScore("var-001", 9000, "QmReportCID");

      return { modelRegistry };
    }

    it("stores challenge evidence and stake via challengeVariant", async function () {
      const { modelRegistry } = await setupApprovedVariant();

      await expect(
        modelRegistry.connect(challenger).challengeVariant(
          "var-001",
          "ipfs://evidence-123",
          "score mismatch",
          {
            value: TRAINER_STAKE_MIN,
          }
        )
      )
        .to.emit(modelRegistry, "ChallengeSubmitted")
        .withArgs("var-001", challenger.address, "ipfs://evidence-123", "score mismatch", TRAINER_STAKE_MIN);

      const receipt = await modelRegistry.getChallengeReceipt("var-001");
      expect(receipt.challenger).to.equal(challenger.address);
      expect(receipt.evidenceCID).to.equal("ipfs://evidence-123");
      expect(receipt.resolved).to.equal(false);
      expect(receipt.stake).to.equal(TRAINER_STAKE_MIN);
    });

    it("slashes selected validators and resolves challenge", async function () {
      const { modelRegistry } = await setupApprovedVariant();

      await modelRegistry.connect(challenger).challengeVariant(
        "var-001",
        "ipfs://bad-batch",
        "fraudulent validation",
        { value: TRAINER_STAKE_MIN }
      );

      await expect(
        modelRegistry.slashValidators(
          "var-001",
          [validator1.address],
          "validator misconduct",
          true,
          true
        )
      )
        .to.emit(modelRegistry, "ValidatorsSlashed")
        .withArgs("var-001", [validator1.address], VALIDATOR_STAKE_MIN, "validator misconduct");

      const stakes = await modelRegistry.getVariantValidators("var-001");
      expect(stakes[0].isSlashed).to.equal(true);

      const variant = await modelRegistry.getVariant("var-001");
      expect(variant.status).to.equal(3); // Rejected
      expect(variant.challengeWindowOpen).to.equal(false);

      const receipt = await modelRegistry.getChallengeReceipt("var-001");
      expect(receipt.resolved).to.equal(true);
      expect(receipt.accepted).to.equal(true);
    });
  });

  describe("Finalization", function () {
    it("Should finalize variant after challenge window", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });
      
      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 1);
      
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });
      
      await modelRegistry.submitValidationResult("var-001", 8500, "QmReport", 1);

      // Fast forward past challenge window (1 hour + 1 second)
      await networkHelpers.time.increase(3601);

      await modelRegistry.finalizeVariant("var-001");

      const variant = await modelRegistry.getVariant("var-001");
      expect(variant.status).to.equal(4); // Finalized
      expect(variant.challengeWindowOpen).to.be.false;
    });

    it("Should reject finalization before challenge window expires", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });
      
      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 48);
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-001", { value: VALIDATOR_STAKE_MIN });
      
      await modelRegistry.submitValidationResult("var-001", 8500, "QmReport", 1);

      await expect(
        modelRegistry.finalizeVariant("var-001")
      ).to.be.revertedWith("Challenge window not expired");
    });
  });

  describe("Policy Management", function () {
    it("Should allow owner to update policy", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.updatePolicy(
        9000, // 90% min score
        30,   // 30 validators
        parseEther("200"),
        parseEther("75"),
        72    // 72 hour challenge window
      );

      const policy = await modelRegistry.policy();
      expect(policy.minScore).to.equal(9000);
      expect(policy.minValidators).to.equal(30);
      expect(policy.challengeWindowHours).to.equal(72);
    });

    it("Should emit PolicyUpdated event", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await expect(
        modelRegistry.updatePolicy(9000, 30, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 72)
      ).to.emit(modelRegistry, "PolicyUpdated");
    });
  });

  describe("Query Functions", function () {
    it("Should return all base model IDs", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID1", "QmMeta1", "v1.0", "QmBench1");
      await modelRegistry.registerBaseModel("base-002", "QmCID2", "QmMeta2", "v1.0", "QmBench2");

      const ids = await modelRegistry.getBaseModelIds();
      expect(ids.length).to.equal(2);
      expect(ids[0]).to.equal("base-001");
      expect(ids[1]).to.equal("base-002");
    });

    it("Should return trainer's variants", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID1", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });
      
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-002", "QmVarCID2", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      const trainerVars = await modelRegistry.getTrainerVariants(trainer.address);
      expect(trainerVars.length).to.equal(2);
      expect(trainerVars[0]).to.equal("var-001");
      expect(trainerVars[1]).to.equal("var-002");
    });

    it("Should check if variant is available", async function () {
      const { modelRegistry } = await deployModelRegistry();

      await modelRegistry.registerBaseModel("base-001", "QmCID", "QmMeta", "v1.0", "QmBench");
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-001", "QmVarCID", "QmMeta", "base-001", {
          value: TRAINER_STAKE_MIN,
        });

      const available = await modelRegistry.isVariantAvailable("var-001");
      expect(available).to.be.false; // Not finalized yet
    });
  });

  describe("Full Workflow", function () {
    it("Should complete full variant approval and finalization flow", async function () {
      const { modelRegistry } = await deployModelRegistry();

      // 1. Register base model
      await modelRegistry.registerBaseModel(
        "base-gpt",
        "QmGPTWeights",
        "QmGPTMeta",
        "v1.0",
        "QmGPTBench"
      );

      // 2. Trainer submits variant
      await modelRegistry
        .connect(trainer)
        .registerVariant("var-gpt-finetuned", "QmFinetunedCID", "QmFineMeta", "base-gpt", {
          value: TRAINER_STAKE_MIN,
        });

      let variant = await modelRegistry.getVariant("var-gpt-finetuned");
      expect(variant.status).to.equal(0); // Submitted

      // 3. Validator stakes
      await modelRegistry
        .connect(validator1)
        .stakeForValidation("var-gpt-finetuned", { value: VALIDATOR_STAKE_MIN });

      variant = await modelRegistry.getVariant("var-gpt-finetuned");
      expect(variant.status).to.equal(1); // Validating

      // 4. Validation result submitted (passing)
      await modelRegistry.updatePolicy(8000, 1, TRAINER_STAKE_MIN, VALIDATOR_STAKE_MIN, 1);
      
      await modelRegistry.submitValidationResult(
        "var-gpt-finetuned",
        8500,
        "QmValidationReport",
        1
      );

      variant = await modelRegistry.getVariant("var-gpt-finetuned");
      expect(variant.status).to.equal(2); // Approved
      expect(variant.challengeWindowOpen).to.be.true;

      // 5. Wait for challenge window
      await networkHelpers.time.increase(3601);

      // 6. Finalize
      await modelRegistry.finalizeVariant("var-gpt-finetuned");

      variant = await modelRegistry.getVariant("var-gpt-finetuned");
      expect(variant.status).to.equal(4); // Finalized
      
      // 7. Variant is available
      const available = await modelRegistry.isVariantAvailable("var-gpt-finetuned");
      expect(available).to.be.true;
    });
  });
});
