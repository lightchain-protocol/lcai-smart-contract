import { expect } from "chai";
import hre from "hardhat";

const { network } = hre;
let ethers: typeof hre.ethers;
let owner: any;
let curator: any;

before(async function () {
  ({ ethers } = await network.connect());
  [owner, curator] = await ethers.getSigners();
});

describe("BenchmarkRegistry", function () {
  async function deployBenchmarkRegistry() {
    const registry = await ethers.deployContract("BenchmarkRegistry");
    return { registry };
  }

  function sampleBenchmarkArgs() {
    return {
      benchmarkId: "finance-qa-v1",
      domain: "finance",
      taskType: "qa",
      benchmarkCID: "QmBenchmarkCID",
      metadataCID: "QmMetadataCID",
      manifestHash: "hash-manifest",
      wrappedDEK: "wrapped-dek",
      version: "1.0.0",
    };
  }

  describe("registration", function () {
    it("stores benchmark metadata and emits events", async function () {
      const { registry } = await deployBenchmarkRegistry();
      const args = sampleBenchmarkArgs();

      await expect(
        registry.registerBenchmark(
          args.benchmarkId,
          args.domain,
          args.taskType,
          args.benchmarkCID,
          args.metadataCID,
          args.manifestHash,
          args.wrappedDEK,
          args.version,
          true
        )
      )
        .to.emit(registry, "BenchmarkRegistered")
        .withArgs(args.benchmarkId, args.domain, args.taskType, args.benchmarkCID, true);

      const stored = await registry.getBenchmark(args.benchmarkId);
      expect(stored.benchmarkId).to.equal(args.benchmarkId);
      expect(stored.domain).to.equal(args.domain);
      expect(stored.taskType).to.equal(args.taskType);
      expect(stored.benchmarkCID).to.equal(args.benchmarkCID);
      expect(stored.metadataCID).to.equal(args.metadataCID);
      expect(stored.manifestHash).to.equal(args.manifestHash);
      expect(stored.wrappedDEK).to.equal(args.wrappedDEK);
      expect(stored.version).to.equal(args.version);
      expect(stored.curator).to.equal(owner.address);
      expect(stored.encrypted).to.equal(true);
      expect(stored.active).to.equal(true);
    });

    it("rejects duplicate ids", async function () {
      const { registry } = await deployBenchmarkRegistry();
      const args = sampleBenchmarkArgs();

      await registry.registerBenchmark(
        args.benchmarkId,
        args.domain,
        args.taskType,
        args.benchmarkCID,
        args.metadataCID,
        args.manifestHash,
        args.wrappedDEK,
        args.version,
        true
      );

      await expect(
        registry.registerBenchmark(
          args.benchmarkId,
          args.domain,
          args.taskType,
          args.benchmarkCID,
          args.metadataCID,
          args.manifestHash,
          args.wrappedDEK,
          args.version,
          true
        )
      ).to.be.revertedWith("Benchmark exists");
    });

    it("requires wrapped DEK when encrypted", async function () {
      const { registry } = await deployBenchmarkRegistry();
      const args = sampleBenchmarkArgs();

      await expect(
        registry.registerBenchmark(
          args.benchmarkId,
          args.domain,
          args.taskType,
          args.benchmarkCID,
          args.metadataCID,
          args.manifestHash,
          "",
          args.version,
          true
        )
      ).to.be.revertedWith("Wrapped DEK required");
    });
  });

  describe("assignments", function () {
    it("automatically assigns first benchmark per domain/task", async function () {
      const { registry } = await deployBenchmarkRegistry();
      const args = sampleBenchmarkArgs();

      await registry.registerBenchmark(
        args.benchmarkId,
        args.domain,
        args.taskType,
        args.benchmarkCID,
        args.metadataCID,
        args.manifestHash,
        args.wrappedDEK,
        args.version,
        true
      );

      const assigned = await registry.getBenchmarkForVariant(args.domain, args.taskType);
      expect(assigned).to.equal(args.benchmarkId);
    });

    it("allows owner to override assignment", async function () {
      const { registry } = await deployBenchmarkRegistry();

      await registry.registerBenchmark(
        "finance-qa-v1",
        "finance",
        "qa",
        "cid-1",
        "meta-1",
        "manifest-1",
        "dek-1",
        "1.0.0",
        true
      );

      await registry.registerBenchmark(
        "finance-qa-v2",
        "finance",
        "qa",
        "cid-2",
        "meta-2",
        "manifest-2",
        "dek-2",
        "2.0.0",
        true
      );

      await registry.setBenchmarkForDomainTask("finance", "qa", "finance-qa-v2");
      const assigned = await registry.getBenchmarkForVariant("finance", "qa");
      expect(assigned).to.equal("finance-qa-v2");
    });

    it("prevents assigning inactive benchmark", async function () {
      const { registry } = await deployBenchmarkRegistry();

      await registry.registerBenchmark(
        "finance-qa-v1",
        "finance",
        "qa",
        "cid-1",
        "meta-1",
        "manifest-1",
        "dek-1",
        "1.0.0",
        true
      );

      await registry.setBenchmarkActive("finance-qa-v1", false);

      await expect(
        registry.setBenchmarkForDomainTask("finance", "qa", "finance-qa-v1")
      ).to.be.revertedWith("Benchmark inactive");
    });

    it("reverts when no benchmark assignment exists", async function () {
      const { registry } = await deployBenchmarkRegistry();

      await expect(
        registry.getBenchmarkForVariant("finance", "qa")
      ).to.be.revertedWith("No benchmark assigned");
    });
  });

  describe("listing helpers", function () {
    it("returns benchmarks by domain and task", async function () {
      const { registry } = await deployBenchmarkRegistry();

      await registry.registerBenchmark(
        "finance-qa-v1",
        "finance",
        "qa",
        "cid-1",
        "meta-1",
        "manifest-1",
        "dek-1",
        "1.0.0",
        true
      );

      await registry.registerBenchmark(
        "finance-classification-v1",
        "finance",
        "classification",
        "cid-2",
        "meta-2",
        "manifest-2",
        "dek-2",
        "1.0.0",
        true
      );

      await registry.registerBenchmark(
        "medical-qa-v1",
        "medical",
        "qa",
        "cid-3",
        "meta-3",
        "manifest-3",
        "dek-3",
        "1.0.0",
        true
      );

      const financeBenchmarks = await registry.listBenchmarksByDomain("finance");
      expect(financeBenchmarks).to.have.length(2);
      expect(financeBenchmarks).to.include.members(["finance-qa-v1", "finance-classification-v1"]);

      const qaBenchmarks = await registry.listBenchmarksByTask("qa");
      expect(qaBenchmarks).to.have.length(2);
      expect(qaBenchmarks).to.include.members(["finance-qa-v1", "medical-qa-v1"]);

      const allBenchmarks = await registry.listBenchmarks();
      expect(allBenchmarks).to.have.length(3);
    });
  });
});
