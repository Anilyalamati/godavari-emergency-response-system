# Known Issues, Prototype Limitations, and Future Work

## 1. Prototype Scope Boundaries & Limitations

### 1. Single Primary Team per Incident

- **Current Behavior:** To guarantee atomic concurrency and eliminate double-booking in this prototype, incidents support exactly one active primary response team assignment at a time.
- **Future Work:** Multi-team dispatch hierarchies (e.g. primary triage team + secondary transport ambulance + police crowd escort) with composite dependency graphs.

### 2. Zone-Based Suitability vs Real-Time Road Routing

- **Current Behavior:** Team recommendations evaluate capabilities, duty status, and festival zone coverage. Distances are calculated using zone adjacency rather than road-network turn-by-turn routing.
- **Future Work:** Integration with an on-premise Open Source Routing Machine (OSRM) or Valhalla engine aware of temporary festival barricades, pedestrian-only bridges, and dynamic crowd bottlenecks.

### 3. Telugu Translation Linguistic Audit

- **Current Behavior:** Localization is implemented across all intake, tracking, navigation, and responder workflows, with an explicit disclaimer banner in the header. However, Telugu wording is a preliminary draft.
- **Future Work:** Comprehensive audit and sign-off by regional Andhra Pradesh disaster management personnel and certified Telugu language specialists.

### 4. Clustered Rate Limiting

- **Current Behavior:** The rate limiter utilizes an in-memory sliding window bucket per Node.js process.
- **Future Work:** Back rate-limiting with a shared Redis or PostgreSQL token-bucket store when scaling across multiple horizontal container replicas.

### 5. Simulated Team Base Stations

- **Current Behavior:** Team locations on the operational map reflect fixed base stations and sector staging posts; the prototype does not stream simulated positions as live GPS telemetry to avoid misleading operators.
- **Future Work:** Hardware GPS beacon integration with encrypted TETRA/APCO-25 radio network gateways.

### 6. Terrestrial Radio Fallback

- **Current Behavior:** The local queue preserves unsent reports in browser IndexedDB during connectivity drops and auto-retries when the network recovers.
- **Future Work:** When severe physical network blackouts occur, field units must operate with paper incident logs and terrestrial VHF/UHF tactical radio frequencies. Software cannot substitute for physical radio backups.
