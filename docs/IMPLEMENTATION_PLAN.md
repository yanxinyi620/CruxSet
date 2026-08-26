# CruxSet Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a tested Phase 1 climbing-wall route management core that can later power a WeChat Mini Program.

**Architecture:** Keep domain logic framework-independent and expose it through typed repository and selector APIs. Start with an in-memory adapter so the MVP is runnable without CloudBase; replace the adapter later without changing route rules.

**Tech Stack:** TypeScript, Vitest, npm.

---

### Task 1: Bootstrap the TypeScript project

**Files:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`

- [ ] Create npm scripts `test`, `test:watch`, and `build`.
- [ ] Configure strict TypeScript and Vitest.
- [ ] Export the public domain API from `src/index.ts`.
- [ ] Run `npm test` and `npm run build`.

### Task 2: Implement route domain rules

**Files:** `src/domain/types.ts`, `src/domain/routes.ts`, `tests/routes.test.ts`

- [ ] Write failing tests for default `feet_follow`, validation, filtering, search, and number ordering.
- [ ] Implement typed route creation and pure selectors.
- [ ] Run the focused tests, then the full suite.

### Task 3: Implement non-repeating random sessions

**Files:** `src/domain/random.ts`, `tests/random.test.ts`

- [ ] Write a failing test proving one session emits each candidate once.
- [ ] Implement Fisher-Yates with injectable RNG for deterministic tests.
- [ ] Verify focused and full tests.

### Task 4: Add in-memory persistence boundary

**Files:** `src/repository/problem-repository.ts`, `src/repository/memory-repository.ts`, `tests/memory-repository.test.ts`

- [ ] Test create/list/get behavior and duplicate-number rejection.
- [ ] Implement the adapter behind an interface.
- [ ] Verify build and tests.

### Task 5: Add MVP usage documentation

**Files:** `README.md`

- [ ] Document setup, test/build commands, domain rules, and the planned WeChat/CloudBase adapter boundary.
- [ ] Run the final verification commands.
