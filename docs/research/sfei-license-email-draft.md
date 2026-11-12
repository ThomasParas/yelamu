**DRAFT — not sent**

To: eigis@sfei.org (the contact SFEI lists for its data compilation)
Cc (optional, verify the name and address on SFEI's site first): the Hidden Nature SF project contact listed on SFEI's website

Subject: Question about terms of use: Hidden Nature SF historical habitats layer

---

Hello,

I'm building a free, non-commercial interactive 3D map of the San Francisco peninsula as it was before European contact (about 1769), as an educational project. I would like to use SFEI's "San Francisco Historical Habitats" layer from the Hidden Nature SF project (ArcGIS Online item c77f714245b34b23b961b2c919a05156, the "Historical habitats dissolved" feature layer, 2021), and I want to check the terms before I publish anything.

The item page does not state a license. Here is what I would do with the layer: classify the ground by habitat type, and use the bay, tidal flat and marsh polygons to reconstruct the 1769 shoreline. The public website would show derived results only (a terrain heightmap and a habitat colour raster at 10 m resolution, not the original polygons), with attribution to SFEI.

Could you tell me:

1. Under what terms may I use this layer, and may I publish derived data and renderings from it on a public website?
2. What attribution or citation would you like? I currently plan to use: "San Francisco Estuary Institute. 2021. Hidden Nature SF, version 1.0. https://hidden-nature.org/"
3. Is there anything I should avoid, or anyone I should speak to first?
4. Will the data from the Mapping Yelamu's Historical Landscape project for the rest of the city be published, and roughly when? The Hidden Nature layer does not cover the south-east of the city, and I would much rather fill that from your mapping than guess.

I am not publishing anything until I hear back. I also plan to contact the Association of Ramaytush Ohlone before adding any cultural content to the map. I'm happy to share the work in progress.

Thank you,

[your name]

---

## Before you send

- **Send it yourself, from your own address.** The draft deliberately has no name or contact details.
- **Check the framing is true for you.** It says "free, non-commercial, educational". If you might ever charge for it or run ads, say so, because it changes the answer.
- **Check the citation line** against SFEI's own wording at <https://hidden-nature.org/>; it is quoted from the project page, as recorded in `2026-data-sources.md`.
- **Until they reply:** keep everything derived from the layer out of git and off the web (`viewer/public/assets/real*/`, `docs/research/local/`). That is already how the repo is set up.
- **The other layer you may use:** the statewide SFEI compilation is published under GPL-3.0-or-later (also in `2026-data-sources.md`), but it only has a 1998 baylands map for San Francisco, so it does not replace the Hidden Nature layer.
