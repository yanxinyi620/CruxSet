# Three-Tab Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `线路 / 创建 / 我的` fixed bottom tabs and place each current workflow in its correct area.

**Architecture:** Convert the three top-level pages to tabBar pages. `线路` remains public discovery, `创建` becomes a creation hub, and `我的` becomes owned-content management. Detail and editor routes remain ordinary secondary pages.

**Tech Stack:** WeChat Mini Program native tabBar, TypeScript, WXML/WXSS, Vitest.

---

### Task 1: Establish tabBar shell

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/walls/index.wxml`
- Modify: `miniprogram/pages/walls/index.ts`

- [ ] Add `tabBar` entries for `pages/walls/index`, `pages/create/index`, and `pages/me/index`; label them `线路`、`创建`、`我的`.
- [ ] Remove the duplicate “我的墙面” button from the discovery page.
- [ ] Run `npm run build` and verify all tabBar paths exist.

### Task 2: Build the creation hub

**Files:**
- Create: `miniprogram/pages/create/index.ts`
- Create: `miniprogram/pages/create/index.wxml`
- Create: `miniprogram/pages/create/index.wxss`
- Create: `miniprogram/pages/create/index.json`
- Modify: `miniprogram/app.json`

- [ ] Render two clear cards: `新建墙面` and `新建线路`.
- [ ] Route wall creation to the existing wall form; route line creation to a wall/Layout selector that accepts owned or public Walls.
- [ ] Show an empty state linking to wall creation when no selectable Layout exists.

### Task 3: Reframe My as management

**Files:**
- Modify: `miniprogram/pages/me/index.ts`
- Modify: `miniprogram/pages/me/index.wxml`
- Modify: `miniprogram/pages/me/index.wxss`

- [ ] Show owned wall cards with privacy status and an edit/manage affordance.
- [ ] Add a separate “我的线路” section and neutral account settings placeholder.
- [ ] Keep all editing routes secondary to tabBar.

### Task 4: Verify and document navigation

**Files:**
- Modify: `docs/manual-test.md`

- [ ] Add test cases for all three tabs, public wall selection when creating a route, and tab state restoration.
- [ ] Run `npm test && npm run build && npm run verify:phase1 -- --release`.
