# Onboarding - MediaPipe Pose Detection Module

Welcome! You're here to help build a clean, modular wrapper around MediaPipe Pose Landmarker for real-time body tracking.

**Project type:** Infrastructure module
**Tech stack:** JavaScript + Node.js + MediaPipe
**Current phase:** Specification complete, ready for implementation

---

## Getting Oriented

**Look for these documents (locations may vary):**

**Spec:**
- Common locations: `mediapipe-pose-spec.md`, `spec.md`, `./docs/spec.md`
- What it contains: Complete technical specification, architecture, sprint plan
- If you can't find it: Ask the user

**DEVLOG:**
- Common locations: `DEVLOG.md`, `./docs/DEVLOG.md`
- What it contains: Sprint-by-sprint record of what was built and why
- If it doesn't exist yet: You'll create it in Sprint 1

**Global Preferences:**
- Location: `.claude/global-preferences.md`
- What it contains: How this human communicates and works
- Read this first before continuing here

**Config Example:**
- Location: `./config/config.example.yaml`
- What it contains: Template configuration with all options
- Created in Sprint 1

---

## About This Human

See `.claude/global-preferences.md` for detailed communication style.

**Quick summary for this project:**
- Direct feedback preferred - no sugar-coating
- Fast-track mode: Make design choices confidently
- Learning by building - explain choices briefly
- Focus on modular, reusable infrastructure
- Config-driven design philosophy

---

## How We Work

**Sprint-based development:**
1. **Implement** a feature from the spec
2. **Write tests** immediately after implementation
3. **Update DEVLOG** with decisions, rationale, and concerns
4. **Commit together** (code + tests + docs in one commit)
5. **One sprint at a time** - complete current work before starting next

**Testing approach:**
- Framework: Vitest + @testing-library
- Write tests for: All business logic 90%+, utilities 100%, display 70%
- Tests must pass before moving on
- Mock MediaPipe responses for detector tests

**Documentation:**
- Update DEVLOG every sprint (while decisions are fresh)
- Keep README current with setup/usage instructions
- Write clear API docs for module export

**Communication:**
- Make reasonable design choices within spec guidelines
- Document choices in DEVLOG
- Flag ambiguities or risks honestly
- User will correct if needed

---

## Project-Specific Notes

**Architecture principle:** Modular and decoupled
- Pose Detector → Filter Pipeline → Data Bus → Consumers (Display, Storage, API)
- Each module is independent and testable
- Display subscribes to Data Bus, doesn't query detector directly
- Another app should be able to import core without GUI

**Config is king:**
- Everything configurable via YAML
- No hard-coded values for behavior/visualization
- Config validation happens at load time
- Config example serves as documentation

**MediaPipe models:**
- Three models: lite (3MB), full (5MB), heavy (26MB)
- Pre-download all three to `/models` folder in Sprint 1
- User selects via config, not runtime download

**MVP vs Stretch:**
- MVP: Single person, real-time webcam, display modes, module export
- Stretch: Recording/replay, batch processing, REST API, multi-person
- Don't build stretch features unless spec updated

**Key files:**
- `poseDetector.js` — MediaPipe wrapper
- `filterPipeline.js` — 1-Euro filter for smoothing
- `dataBus.js` — Event system for pose data
- `displayModule.js` — Visualization and GUI
- `configManager.js` — YAML config loading/validation

---

## Sprint Overview

**Sprint 1:** Project setup + config system
**Sprint 2:** MediaPipe pose detector core
**Sprint 3:** Filter pipeline (1-Euro smoothing)
**Sprint 4:** Data Bus event system
**Sprint 5:** Display module & GUI
**Sprint 6:** Webcam integration & real-time processing
**Sprint 7:** Polish, docs, module export

Each sprint is self-contained. If you need to hand off between sprints, write a handover using the handover guide.

---

## If You're the First Agent (Sprint 1)

**Create these files:**

**DEVLOG.md:**
```markdown
# Development Log - MediaPipe Pose Detection Module

## Sprint 1 - Project Setup & Config System

[You'll fill this in as you complete Sprint 1]
```

**package.json:**
- Express server
- MediaPipe Tasks Vision
- js-yaml for config
- Vitest for testing

**config/config.example.yaml:**
- Complete config template from spec Section 3

**README.md:**
- Project description
- Setup instructions
- How to run

**Download MediaPipe models:**
- pose_landmarker_lite.task
- pose_landmarker_full.task  
- pose_landmarker_heavy.task
- Save to `/models` folder

---

## Common Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server with hot reload
npm test                 # Run all tests
npm run test:watch       # Watch mode for tests
npm run test:coverage    # Coverage report
```

---

## Writing Handovers

**When to write a handover:**
- Context reset needed between sprints
- Stuck and need fresh perspective
- Major milestone completed

**What to include:**
- Sprint N completed, Sprint N+1 next
- Key decisions made this session
- Tests passing count
- Known issues or concerns
- Specific next steps

**Keep it brief** - Reference spec and DEVLOG for details.

---

## Critical Reminders

**Module boundaries:**
- Don't let detector know about display
- Don't let filter know about MediaPipe
- Everything goes through Data Bus

**Testing:**
- Not optional
- Sprint isn't done until tests pass
- Mock MediaPipe responses, don't try to run real inference in tests

**Config:**
- Validate on load
- Provide helpful error messages
- Use defaults for missing keys

**Performance:**
- Target 30 FPS
- Profile if slower
- User can switch to lite model

---

**Ready to start? Read the spec (mediapipe-pose-spec.md), then begin Sprint 1.**
