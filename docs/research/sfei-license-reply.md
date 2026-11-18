# SFEI's reply on the Hidden Nature SF licence (recorded 2026-11-17)

Reply to the licence inquiry (sent to eigis@sfei.org; the draft is no longer kept in the repository), from SFEI's Senior GIS Manager, Environmental Informatics. The terms below are SFEI's own text, copied from the reply.

## Terms SFEI gave

> San Francisco Historical Habitats data is part of Hidden Nature SF.
>
> Hidden Nature SF is free data: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
>
> Hidden Nature SF is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
>
> More information about GNU General Public License is available at http://www.gnu.org/licenses/. SFEI data are available without restriction upon use with the following caveats. Prudent usage, knowledge of the data quality, and professional courtesy should all be considered in obtaining and using SFEI data. As this dataset is NOT a survey document, neither use it as such nor use it beyond the limits of the source scale. Please read and fully comprehend all available metadata prior to data use. SFEI requests that the use of these data in any map, publication, or report should include citation of the data source(s) used and give proper attribution and credit to the originators of the data. Questions about SFEI data may be directed to the SFEI GIS team at eigis@sfei.org.

Also in the reply:

- The citation in the first email ("San Francisco Estuary Institute. 2021. Hidden Nature SF, version 1.0. https://hidden-nature.org/") "works great".
- SFEI's expanded mapping for *Mapping Yelamu's Historical Landscape* will be available by **fall 2027**.
- Contact the Association of Ramaytush Ohlone for permission before publishing any cultural content.

## What this changes

- **The gate is lifted.** The layer is GPL-3.0-or-later with the caveats above, so derived results may be published, with the citation and the terms. The About dialog now shows the terms and the disclaimer (Data terms), and the Credits list already carries the citation.
- **GPL consequence to decide (not legal advice; check before launch).** Data under the GPL that is modified and distributed has to be offered under the same GPL terms, with its source. Our published heightmap, habitat raster, `ponds.json` and `meta.json` derive from it. The simplest consistent plan is to publish those derived data files, and the pipeline that builds them, under GPL-3.0-or-later. Whether the viewer code, which only reads those files, may carry a different licence is a question for the project owner to settle, ideally with advice. No licence file has been added to the repo yet.
- **Scale caveat.** "Not a survey document, do not use beyond the limits of the source scale": the About dialog already says the map is not a survey or for navigation, engineering or legal use; the 10 m grid should not be presented as finer than the source.
- **Other sources are separate.** USGS 3DEP and TIGER are public domain, NOAA's shoreline vectors have no stated access constraints (credit NOAA), and the Rumsey and Stanford scans remain reference only.
- **Still ignored in git:** `viewer/public/assets/real*/` and `docs/research/local/` stay out of the repository for now. That is now a size and hosting decision, not a licence one.
- **SFEI's expanded mapping (fall 2027)** may replace the south-east guesses, the NOAA-seeded areas and Lake Merced. Revisit then.
