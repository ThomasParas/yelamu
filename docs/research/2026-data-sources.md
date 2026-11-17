# Data sources research spike (2026-11-11)

Test box (lon/lat): west -122.42, south 37.755, east -122.37, north 37.805 (Yerba Buena Cove / Mission Bay area).

Method: SFEI's website returns HTTP 403 to plain scripted requests, so SFEI pages were read through a web scraper. The ArcGIS service and the USGS/TNM APIs were queried directly (metadata and small attribute queries only). Nothing large was downloaded for analysis. A 3.9 MB GeoJSON of the SF habitat layer and 256 KB GeoTIFF headers were fetched to a scratch folder to verify counts and CRS, and are not in the repo.

Statements marked **not verified** were not confirmed from a source read in this spike.

---

## Step 1. Elevation source

**Dataset:** USGS 3D Elevation Program (3DEP), bare-earth DEM. Found through The National Map's product API (the backend of <https://apps.nationalmap.gov/downloader/>).

### Chosen for the slice: 1/3 arc-second DEM, one file covers the whole box

| Item | Value |
|---|---|
| Name | USGS 1/3 arc-second DEM, tile n38w123 (current) |
| Download (click to download GeoTIFF) | <https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n38w123/USGS_13_n38w123.tif> |
| Coverage | 1 x 1 degree, lon -123 to -122, lat 37 to 38.0006. The whole test box is inside it. |
| Resolution | 1/3 arc-second, about 10 m. GeoTIFF header pixel size 9.259e-05 degrees. |
| CRS | **EPSG:4269** (NAD83 geographic lon/lat). Read from the GeoTIFF GeoKeys (ProjectedCSType/GeographicType 4269). |
| Format / size | GeoTIFF, 222,936,410 bytes (HTTP HEAD, Last-Modified 27 Aug 2025). |
| Vertical datum | NAVD88 (stated in USGS 3DEP product text for the 1 m product; for this 1/3 product **not verified** from a page read here). |
| Whether SF area is lidar-derived in this tile | **not verified**. |

### Finer option (not used for the slice): 1 m lidar-derived, two tiles needed

The box spans two 1 m tiles, both project CA_SanFrancisco_B23 (lidar collected 2023-04-20, published 2024-08-26):

- Tile x55y418 (lat 37.675 to 37.766), 147,948,547 bytes: <https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_SanFrancisco_B23/TIFF/USGS_1M_10_x55y418_CA_SanFrancisco_B23.tif>
- Tile x55y419 (lat 37.765 to 37.856), 86,461,076 bytes: <https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects/CA_SanFrancisco_B23/TIFF/USGS_1M_10_x55y419_CA_SanFrancisco_B23.tif>
- CRS **EPSG:26910** (NAD83 / UTM zone 10N), 1.0 m pixels, 10012 x 10012 px per tile. Verified from the GeoTIFF header and the product XML (`NAD83 / UTM zone 10N`).
- Metadata: <https://www.sciencebase.gov/catalog/item/66ce871dd34e98e8a92453d1> (x55y418), <https://www.sciencebase.gov/catalog/item/66ce871ad34e98e8a92453cb> (x55y419); product XML <https://thor-f5.er.usgs.gov/ngtoc/metadata/waf/elevation/1_meter/geotiff/CA_SanFrancisco_B23/USGS_1M_10_x55y418_CA_SanFrancisco_B23.xml>
- Product description (verbatim): "The elevations in this DEM represent the topographic bare-earth surface."
- This matches the spec's UTM zone 10N working grid directly, so it is the better fit for later phases.

Other 1 m products also overlap the box (CA_NoCAL_Wildfires_B5b_2018, CA_AlamedaCounty_2021_B21, CA_CaliforniaGaps_B23). They were not evaluated.

### License / terms

- USGS (<https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits>), verbatim: "USGS-authored or produced data and information are considered to be in the U.S. Public Domain."
- Credit requested, verbatim: "When using information from USGS information products, publications, or websites, we ask that proper credit be given." Example credit line given there: "Credit: U.S. Geological Survey".
- Product metadata use constraint (1 m tile XML), verbatim: "Acknowledgement of the originating agencies would be appreciated in products derived from these data. Any user who modifies the data is obligated to describe the types of modifications they perform. User specifically agrees not to misrepresent the data, nor to imply that changes made were approved or endorsed by the USGS."
- Same XML, verbatim: "There is no guarantee or warranty concerning the accuracy of the data."
- Citation string from SB record: "U.S. Geological Survey, 20240826, USGS 1 Meter 10 x55y418 CA_SanFrancisco_B23: U.S. Geological Survey."

Acceptance: a clickable GeoTIFF URL covering the box (the n38w123 link above) and its CRS (EPSG:4269). Met.

---

## Step 2. Historical water and habitat data

### 2a. SFEI Historical Ecology GIS Data Compilation (statewide)

Page: <https://www.sfei.org/data/historical-ecology-gis-data-compilation> (last updated 27 Feb 2026 per page).

- File: "Historical Ecology GIS Data Compilation v2.3", 48.96 MB: <https://www.sfei.org/sites/default/files/data/HE_Compilation_v2.3.zip> (not downloaded).
- Contains habitat and channel layers. Web-service versions at CDFW BIOS: <https://apps.wildlife.ca.gov/bios6/?al=3201> (habitats), <https://apps.wildlife.ca.gov/bios6/?al=3202> (channels). Page says v2.2 for the web services.
- Terms of Use, verbatim: "SFEI's Historical Ecology GIS Data Compilation is free data: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version."
- Also verbatim: "SFEI's Historical Ecology GIS Data Compilation is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE."
- **Required citation, verbatim:** "San Francisco Estuary Institute (SFEI). 2026. "Historical Ecology GIS Data Compilation v2.3". Accessed [date retrieved]. https://www.sfei.org/data/historical-ecology-gis-data-compilation"
- Contact: eigis@sfei.org.

**Metadata (CDFW BIOS, ds3201 and ds3202)**, <https://filelib.wildlife.ca.gov/Public/BDB/GIS/BIOS/metadata/DS3201.html> and <https://filelib.wildlife.ca.gov/Public/BDB/GIS/BIOS/metadata/DS3202.html>:

- Format: File Geodatabase feature class, polygon (ds3201) / line (ds3202). CRS **NAD_1983_California_Teale_Albers, EPSG:3310**, meters. Extent covers lon -122.856516 to -116.641916, lat 32.444756 to 38.796343.
- Habitat classification fields: `LegLabel` (major habitat class), `LegCode`, `ClickLabel` (detailed habitat type), `ClickCode`. Certainty fields `InterpCert`, `ShapeCert`, `LocCert` (H/M/L). `HEProject` names the source project.
- **The value lists for `LegLabel` / `ClickLabel` are not on the metadata pages.** Getting them requires opening the 49 MB geodatabase. **Not verified.**
- **San Francisco coverage in this compilation:** the project list on the metadata page includes only "San Francisco Baylands (1998)" (<https://www.sfei.org/ea-1998>) for the city. Hidden Nature SF and Mapping Yelamu's Historical Landscape are not in the list. A 1998 bayland-only map is coarse and would not cover dunes, creeks, or uplands. This is inferred from the project list, **not verified** against the geodatabase.
- Oddity: the ds3201 Credits text says "Historical_channels_Suisun is free data..." (copy/paste from another dataset). The license grant is the same GPL v3-or-later.
- Use limitation, verbatim (excerpt): "If data is transmitted or provided in any form to another user, the data must be accompanied by a copy of this disclaimer and all documentation provided with the original data set, including the full metadata record. SFEI requests that the use of these data in any map, publication, or report should cite the data source(s) used and give proper attribution and credit to the originators of the data."
- Also verbatim: "If this data is modified, changes should be documented in a metadata record that should accompany all redistributed data."
- Also verbatim: "These data are not legal documents or of survey quality and are not intended to be used as such."

### 2b. SFEI "San Francisco Historical Habitats" (Hidden Nature SF, 2021): the layer to use

This is the SF-specific layer, found through the Hidden Nature SF ArcGIS Online item; it is not listed in SFEI's Data Center.

- Item page: <https://www.arcgis.com/home/item.html?id=c77f714245b34b23b961b2c919a05156> (owner `rlandscapes`, public, tags "Historical Ecology", "Hidden Nature SF", "San Francisco"; snippet "Historical habitats of San Francisco, developed in 2021 by the San Francisco Estuary Institute").
- Service: <https://services1.arcgis.com/8V9ShUQ1DGYVLtOg/arcgis/rest/services/Historical_habitats_dissolved_v3/FeatureServer> (layer id 1, "Historical habitats dissolved", polygon, query-only, supports JSON/GeoJSON/PBF, 450 features, max 2000 records per request).
- **Download URL (single request returns all 450 features, about 3.9 MB, verified):** <https://services1.arcgis.com/8V9ShUQ1DGYVLtOg/arcgis/rest/services/Historical_habitats_dissolved_v3/FeatureServer/1/query?where=1%3D1&outFields=*&outSR=4326&f=geojson>
- **CRS:** service native EPSG:3310 (NAD83 California Teale Albers). The GeoJSON above is EPSG:4326 as requested by `outSR`.
- **Extent:** lon -122.5265 to -122.3770, lat 37.7293 to 37.8199. Covers the test box except a strip east of lon -122.377 (open bay; no polygons there). Initial phase mapped "the northern portion of the San Francisco peninsula" (SFEI project page).
- **Fields:** `FID`, `HabitatCla` (string, width 150), `Shape__Area`, `Shape__Length`. No certainty fields, no source field.
- **Classification field: `HabitatCla`.** Distinct values (31, verified by query):
  Barrier beach-impounded freshwater lagoon; Beach; California Bay Woodland; Coast live oak woodland; Coastal bluff scrub; Coastal prairie; Coastal prairie/scrub; Coastal scrub; Deep ocean/bay; Dune slack; Dune-dammed headwater lake; Dune-dammed pond or lake; Fen; Foothill grassland; Island; Maritime chaparral; Mobile dunes; Other pond or lake; Riparian woodland; Sandy/Rocky Intertidal; Serpentine grassland; Serpentine maritime chaparral; Serpentine slope wetland/serpentine maritime chaparral complex; Shallow ocean/bay; Stabilized dune/dune scrub/grassland; Tidal coastal lagoon; Tidal flat; Tidal marsh; Tidal slough; Wet meadow; Willow grove.
- **Bay values (open bay / tidal flat):** `Deep ocean/bay`, `Shallow ocean/bay`, `Tidal flat`.
- **Marsh values (tidal marsh):** `Tidal marsh`. `Tidal slough` is added in slice.env by my judgement; it is not an SFEI definition. `Tidal coastal lagoon` is left out of both lists and needs a separate decision in Task 3 (2 polygons intersect the test box).
- Polygons per class intersecting the test box (checked): Deep ocean/bay 1, Shallow ocean/bay 7, Tidal flat 4, Tidal marsh 8, Tidal slough 2, Tidal coastal lagoon 2, Sandy/Rocky Intertidal 1, Beach 5, Mobile dunes 1, Stabilized dune/dune scrub/grassland 5, Willow grove 24, Coast live oak woodland 42, plus others.
- **UPDATE 2026-11-17: SFEI confirmed in writing that Hidden Nature SF is GPL-3.0-or-later with caveats (see `sfei-license-reply.md`).** The line below records what the item page showed before that reply.
- **License: NONE STATED.** The item's `licenseInfo`, `accessInformation`, and metadata `useLimit` are empty. **License terms not verified.**
- **Citation the project gives for the Hidden Nature SF web map, verbatim:** "San Francisco Estuary Institute. 2021. Hidden Nature SF Web Map, version 1.0. https://map.hidden-nature.org/home" (from <https://map.hidden-nature.org/explore>). The project site says: "Preferred citation: San Francisco Estuary Institute. 2021. Hidden Nature SF, version 1.0. https://hidden-nature.org/" (<https://sites.google.com/sfei.org/hidden-nature-sf/the-project/about-hidden-nature-sf>). These are citations for the web map and project, not a stated license for this layer.

Related public SFEI ArcGIS items, not evaluated in detail (listed for Task 12/later): "San Francisco Historical Creeks" (id b09c42756dd84305a919bccf46b0e88b, extent lon -122.4854 to -122.4031, lat 37.7552 to 37.8089; the east edge stops short of the Mission Bay/Yerba Buena shoreline, **coverage of Mission Creek not verified**); MYHL_HistoricStreams and MYHL_HistoricWatersheds (derived from a modeled historical DEM, extent lat 37.69 to 37.749, which is **south** of the test box; the description text has unfilled blanks "developed by ____"). None of these states a license either.

### 2c. Mapping Yelamu's Historical Landscape (MYHL)

<https://www.sfei.org/projects/mapping-yelamu-s-historical-landscape> (2024 to 2026). Collaboration of SFEI, the Association of Ramaytush Ohlone, and the Exploratorium. Funded by the State Coastal Conservancy. Per the page it "builds on existing historical ecology research, developed through Hidden Nature SF and Next Generation Urban Greening, to extend the mapping of historical landscape features, such as habitat types and creeks, to remaining portions of San Francisco not covered by prior projects." No data download is offered on that page. For the test box the existing Hidden Nature SF layer (2b) is the relevant data.

Acceptance: file named (2b service query URL), classification field (`HabitatCla`), bay values and marsh values given. Met for the SF layer. For the statewide compilation the value lists are not verified.

---

## Step 3. 1850s US Coast Survey topographic sheets

Verdict: **available and georeferenced** (for at least the 1853 map and SFEI's own T-sheet layers). Use for hand-sculpting reference in Task 12.

| Source | What it is | Georeferenced | Terms |
|---|---|---|---|
| Stanford Digital Repository, <https://purl.stanford.edu/xz007mk8152> | 1853 US Coast Survey "City of San Francisco and its vicinity" (Rodgers topography, No. 627), Rumsey georeferenced GeoTIFF. `g3463000.tif` 138.98 MB, plus a COG version 144.73 MB. EPSG:4326, extent 122°25'54"W to 122°22'25"W, 37°49'21"N to 37°45'28"N (covers nearly all of the test box; the box's southern 0.003 degrees fall just outside). | Yes | See below |
| David Rumsey, 1859 edition, <https://www.davidrumsey.com/maps1622.html> | "City of San Francisco and its vicinity", scale 1:10,000, uses contours, 61 x 89 cm print. | Georeferenced status of this record **not verified** | See below |
| SFEI Hidden Nature WMS, <https://mapserver.sfei.org/cgi-bin/mapserv?map=/var/mapwork/mapfiles/hiddennature.map> | Georeferenced layers `t352_1852` (extent lon -122.469 to -122.342, lat 37.6936 to 37.8212; covers the box), `t687_1857` (lon -122.487 to -122.348, lat 37.7158 to 37.8531; covers the box), `t382B` (lon -122.534 to -122.442; does not reach the box), `rogers1873`, `warner1847`, `survey_1869`, `sfdem`, `hillshade`. Names suggest T-sheets 352, 382B, and 687; sheet identities **not verified**. | Yes (WMS) | **not verified** (not stated in what was read) |
| NOAA T-sheets, <https://shoreline.noaa.gov/t-sheets.html> and georeferenced download <https://nsde.ngs.noaa.gov/> | NOAA lists "Georeferenced T-Sheets" and scanned T-sheets. Whether the 1850s San Francisco sheets are there **not verified**. | claimed | **not verified** |
| NOAA Historical Map & Chart Collection, <https://historicalcharts.noaa.gov/> | 35,000+ historical charts and surveys, viewing/download. SF 1850s items not individually checked. | Scans, not necessarily georeferenced | **not verified** |
| SFEI "U.S. Coast Survey Maps of California", <https://www.caltsheets.org/> and user guide <https://www.caltsheets.org/user_guide.pdf> | SFEI's T-sheet portal and guide. Site footer: "Copyright San Francisco Estuary Institute 2014. All Rights Reserved." | Per guide, georeferenced versions exist | All rights reserved notice on the site |

Scan resolution (dpi) of the Rumsey/Stanford image was **not verified**; the GeoTIFF is about 139 MB.

Terms, verbatim:
- Stanford record: "Images may be reproduced or transmitted, but not for commercial use. For commercial use or commercial republication, contact rumseymapcenter@stanford.edu This work is licensed under a Creative Commons License." and "This work is licensed under a Creative Commons Attribution Non Commercial Share Alike 3.0 Unported license (CC BY-NC-SA)." Credit line there: "Image from the David Rumsey Map Collection courtesy Stanford University Libraries."
- Rumsey 1859 record: "Images may be reproduced or transmitted, but not for commercial use." and "This work is licensed under a Creative Commons License" (links to CC BY-NC-SA 2.0).

Implication: use these images only as private sculpting reference and do not embed or redistribute the scans on a public site. If the site is ever commercial, or if derived assets could be called an adaptation of the scans, the NC/SA terms could bite. The 1850s originals are public domain by age, but the georeferenced scans are licensed by the repository.

---

## Step 4. Yelamu village-site material

**Already public**
- SFEI MYHL page (above) states: "There currently is no single, authoritative ethnohistorical record of the Yelamu" and describes a goal of "an accurate and accessible map of village locations and other cultural sites within the boundaries of San Francisco." (quotes from <https://www.sfei.org/projects/mapping-yelamu-s-historical-landscape>).
- ARO "About" (<https://www.ramaytush.org/about.html>): ARO "has begun mapping Ramaytush Ohlone trails and villages along the San Francisco Peninsula using ArcGIS". It also lists "Protection and Restoration of Sacred Sites (confidential)" as a project.
- ARO Research page (<https://www.ramaytush.org/research.html>): the MYHL ethnohistory and tribal landscape map are described as funded and in progress; it says ARO is "looking forward to creating accurate and useful maps of Yelamu that will be made publicly available."
- ARO Territory page (<https://www.ramaytush.org/ramaytush-territory.html>): published territory boundary reasoning, headed "an updated and much more precise map is coming soon". It does not publish a village-site map.
- Hidden Nature SF has a "The Yelamu" page and an ArcGIS StoryMap "Yelamu: the Native Peoples of San Francisco" (item id 56b1d134920d46c6ac2462c1344eeb3f). **Contents not examined in this spike.** SFEI's ArcGIS account also hosts a "MYHL Reference Map" feature service (id f66ea7d4687f43b6b08392cd2b914326), **not opened**, and no site coordinates were copied.

**Not public / in progress:** a finished village-and-trail map and ethnohistory (still being produced as of the project dates 2024 to 2026); sacred-site work is described as confidential.

**Stated terms of use:** none found for village or trail data on the SFEI or ARO pages read. Because no terms are published and the work is a live collaboration, treat village and trail data as unavailable for reuse until the Association says otherwise. This matches the spec: the cultural layer is optional, ARO has veto power, and sensitive sites are not mapped.

Contact route on ARO site: <https://www.ramaytush.org/contact.html> (staff addresses, phone, mailing address listed there).

---

## Step 5. Outreach draft

Written to `docs/research/aro-outreach-draft.md` (220 words, header "DRAFT — not sent", sign-off left blank, no claims about the Association's position). **Not sent.**

---

## Step 6. slice.env

Written to `docs/research/slice.env`. All six variables are filled. Notes:
- `DEM_URL`: 1/3 arc-second single tile (EPSG:4269). The 1 m lidar tiles are the better quality option but need two files and a merge.
- `SFEI_URL` / `SFEI_LAYER`: the SF Hidden Nature habitat layer, not the statewide compilation, because the compilation's SF content appears limited to the 1998 baylands map. `SFEI_LAYER` is informational for the GeoJSON route.
- `BAY_VALUES` / `MARSH_VALUES` are verified against the service's actual values. The Tidal slough placement is a judgement call.
- The service gives only a habitat class per polygon: no shoreline line, no creek lines, no certainty fields. Per the spec's `documented | inferred | illustrative` tags, the slice should tag polygon edges as `inferred`/`documented` only after checking against the T-sheets.

---

## Decision: **Go with changes**

Sources exist for all three inputs (elevation, historical habitat polygons, 1850s sheets) and the test box is covered. The changes:

1. **Use the Hidden Nature SF habitat layer (2b), not the statewide compilation.** The compilation lists only the 1998 baylands map for San Francisco and its class values could not be verified without a 49 MB download. If Task 12 later wants the compilation, download it and list `LegLabel`/`ClickLabel` first.
2. **(Superseded 2026-11-17: SFEI replied, GPL-3.0-or-later; see `sfei-license-reply.md`.) The SF habitat layer has no stated license.** Local processing for the slice is fine. **Do not publish derived assets (splat map, shoreline/creek vectors, anything built from it) on a public site until SFEI confirms terms in writing** (eigis@sfei.org is the contact listed for the compilation; the Hidden Nature project contact on SFEI's site is Sean Baumgarten). Ask specifically about redistribution of derived raster and vector assets with attribution, and about the citation form.
3. **If the statewide compilation is used (or SFEI says the SF layer carries the same terms): GNU GPL v3 or later applies.** Publishing derived assets would likely mean offering those assets under GPL-3.0-or-later with the original disclaimer and metadata, and documenting modifications. Whether GPL obligations extend to a rendered map or heightmap is a legal question I did not resolve. Get a legal read or SFEI's confirmation before launch.
4. **Treat marsh as "documented polygon, shoreline accuracy low"**: the layer has no per-polygon certainty fields, so confidence tags (spec 5.4) will be assigned by us, not inherited. Reconstruct creeks separately (Mission Creek coverage not verified).
5. **Coast Survey scans are reference only** (CC BY-NC-SA). Do not redistribute them or ship them in the viewer.
6. **USGS DEM needs only credit** ("U.S. Geological Survey"), plus a note describing our modifications and no implied USGS endorsement.
7. **Cultural layer stays off the critical path.** No village data is available for reuse and none should be copied; outreach to ARO is a draft only and requires the user's decision.

Not a Stop: nothing found forbids a private, local slice. The only open risk is the public-release license of the SF habitat layer.

### Items not verified in this spike
- Value lists for the statewide compilation's `LegLabel`/`ClickLabel`, and its actual SF coverage.
- License of the SF habitat layer, of SFEI's WMS T-sheet layers, and of NOAA's georeferenced T-sheets.
- Whether the 1/3 arc-second tile in the SF area is lidar-derived, and its vertical datum.
- Scan resolution of the Rumsey/Stanford map; georeferenced status of the 1859 Rumsey record.
- Contents of the Yelamu StoryMap and the MYHL Reference Map.
