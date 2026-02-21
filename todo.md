# Project TODO

## Server-Side Processing Refactor
- [x] Install node-canvas and image processing dependencies
- [x] Port TerrainGenerator to Node.js backend
- [x] Create /api/generate-stl endpoint
- [x] Update frontend to call backend API instead of client-side generation
- [x] Test full-stack STL generation flow
- [x] Create Docker deployment configuration
- [x] Write deployment guide for Linux VM

## Fixes
- [ ] Normalize longitude on client: still getting weird -longitude (e.g. -231°) in UI/bounds; server normalizes but display/selection may need client-side fix
