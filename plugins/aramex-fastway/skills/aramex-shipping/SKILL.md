---
name: aramex-shipping
description: Ship, quote, track, label or cancel parcels with Aramex (formerly Fastway) in Australia or New Zealand using the aramex MCP tools. Use when the user mentions Aramex, Fastway, a Fastway/Aramex tracking or label number, booking a courier, or printing a shipping label in AU/NZ.
---

# Aramex (Fastway) shipping

The `aramex` MCP server wraps the Aramex AU/NZ API (formerly MyFastway). Tools:

| Tool | Use for | Side effects |
|---|---|---|
| `aramex_track` | Tracking events for a label number | none |
| `aramex_quote` | Price and services for a shipment | none |
| `aramex_validate_address` | Check or normalise an address | none |
| `aramex_create_consignment` | Book a shipment and get label numbers | **creates a billable consignment** |
| `aramex_get_consignment` | Look up a booked consignment | none |
| `aramex_get_labels` | Save the label PDF to disk | writes a file |
| `aramex_cancel_consignment` | Cancel a consignment before pickup | **irreversible** |
| `aramex_api_request` | Any other `/api/...` endpoint | depends on method |

## Workflow for sending a parcel

1. Collect the receiver's details: name or business, phone, email, street, suburb (`Locality`), state, postcode. Also collect each item: parcel (`P`) or satchel (`S`), weight in kg, and L×W×H in cm for parcels or the satchel size for satchels.
2. If the address looks unusual, run `aramex_validate_address` and use the normalised result.
3. Run `aramex_quote` and show the user the price and service options.
4. **Ask for explicit confirmation** before `aramex_create_consignment`. Booking costs money.
5. After booking, report the consignment ID and label numbers, then offer `aramex_get_labels` (4x6 for thermal printers, A4 for office printers).

Leave `From` out unless the user gives a different pickup address. The account's default address is used when it's missing.

## Rules

- Never cancel a consignment without the user confirming the specific consignment ID.
- If a tool returns 401 or 403, the credentials or scope are wrong. Tell the user to check `ARAMEX_CLIENT_ID`, `ARAMEX_CLIENT_SECRET` and `ARAMEX_REGION` (`au` or `nz`).
- If a tool returns 404 for an endpoint that should exist, the path may differ in the user's API version. Try `aramex_api_request` and tell the user that `server/src/config.js` may need updating.
- Weights are in kg and dimensions in cm. Convert any other units first.
