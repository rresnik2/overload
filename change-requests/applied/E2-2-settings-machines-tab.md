# E2-2: add a "Machines" tab to the settings nav (stream A file)

**What.** `src/components/profile/SettingsNav.tsx`:

```diff
 const TABS = [
   { href: "/settings/profile", label: "Profile" },
+  { href: "/settings/machines", label: "Machines" },
   { href: "/settings/security", label: "Security" },
   { href: "/settings/account", label: "Account" },
 ] as const;
```

**Why.** E2 ships `/settings/machines` (machine profiles), but the settings sub-navigation is stream A's file, so the page has no tab.

**Workaround.** `/settings/machines` is reachable from `/workout` ("Machines" link) and by URL. It also renders inside A's settings layout.
