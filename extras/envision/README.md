# Envision profile for UDCAP gloves

[Envision](https://gitlab.com/gabmus/envision) builds Monado from a *profile*. Stock
Monado has no UDCAP glove driver, so you need a profile that builds our fork, which includes it.

There are two ways to get this profile into Envision.

## Option A — create it by hand (recommended, always works)

In Envision, add a new profile (or duplicate the default Monado one) and set:

| Field             | Value                                   |
| ----------------- | --------------------------------------- |
| XR Service Repo   | `https://github.com/Eidenz/Monado`      |
| XR Service Branch | `main`                                  |

That's enough, the UDCAP driver builds in automatically on Linux. If you want to be
explicit, also add the CMake flag `XRT_BUILD_DRIVER_UDCAP` = `ON`.

Then **Build** the profile and set it as the active runtime. Start the gloves from
udcap-control and they'll show up as Index controllers in OpenXR.

## Option B — import `udcap-monado.json`

This folder ships [`udcap-monado.json`](./udcap-monado.json), a portable profile using
Envision's `@DATADIR@` / `@UUID@` placeholders (so paths resolve on any machine).

Envision's profile **Import** lives in its advanced/debug view and shows a warning about
importing profiles that reference forks, that's expected here (the fork is ours). Inspect
the JSON first (it only points at `github.com/Eidenz/Monado` and enables the UDCAP driver),
then import it. Envision opens it in the editor for review before saving.

## Notes

- The driver auto-activates when udcap-control's server is running (it reads the shared
  memory at `/dev/shm/udcap_hands`); there's no enable env var.
- The fork must match the shm layout udcap-control's server uses, keep both up to date.
