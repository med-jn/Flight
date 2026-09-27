# FLIGHT — setup steps

1. Unzip this into a fresh `FLIGHT` folder (or over your copy of the astro project — every
   file here fully replaces the old astro-specific one, or is new).

2. Delete the astro-only files that have no equivalent here (they weren't part of this
   package because nothing replaces them 1:1):
   ```
   del src\core\zodiac.ts
   del src\core\mansions.ts
   del src\core\starCatalog.ts
   del src\core\contentRegistry.ts
   del src\core\bodies.ts
   del src\core\eclipticTransform.ts
   del src\core\observer.ts
   del public\data\stars.json
   del public\data\zodiac.json
   del src\types\astro.ts
   ```

3. Install dependencies (astronomy-engine is gone, fuse.js is new):
   ```
   npm install
   npm install fuse.js
   npm uninstall astronomy-engine
   ```

4. Generate the airport dataset (needs internet access, run once):
   ```
   npm run data:airports
   ```

5. Adjust `vite.config.ts`'s `base` path to match your actual deployment path.

6. Add `.env.local` (see the chat for the exact variable names and where to find them).

7. Run it:
   ```
   npm run dev
   ```
