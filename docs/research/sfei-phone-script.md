**DRAFT: a call script, not a record of a call**

# Calling SFEI about the Hidden Nature SF licence

Goal of the call: get a yes or no, in their own words, on **publishing derived results** from the Hidden Nature SF "Historical habitats" layer, plus the attribution they want. Everything else is a bonus. You have already emailed `eigis@sfei.org`; the call is a nudge, so you can mention that.

## Before you dial (one minute)

- Have this open: the layer name (San Francisco Historical Habitats, "Historical habitats dissolved", 2021, ArcGIS item `c77f714245b34b23b961b2c919a05156`) and your email's date.
- Have a pen ready. Write down the person's name, the date and time, and their exact words on licence and attribution.
- Decide your own answer to "is it commercial?" (see the draft email: it assumes free, non-commercial, educational). Say what is true for you.

## Opening (15 seconds)

> "Hi, my name is [name]. I'm working on a free educational project, an interactive 3D map of the San Francisco peninsula as it was around 1769. I'm using the Hidden Nature SF historical habitats layer, and I have a quick question about its terms of use. Who is the right person to ask?"

If they ask you to hold or call back, ask for a name, a direct line or email, and a good time. Then stop.

## The ask (30 seconds, once you have the right person)

> "The layer's item page doesn't state a licence. I emailed eigis@sfei.org on [date] but haven't heard back, so I thought I'd call. I'm not publishing anything until I hear. On the public site I'd show only derived results: a 10-metre terrain heightmap, a habitat colour raster, and the outlines of some ponds. Not the original polygons. With credit to SFEI. May I do that?"

## Questions, in priority order

1. **"May I publish derived data and renderings made from the layer on a public website?"** (the one answer you cannot do without)
2. **"Is there a licence or terms document I can cite, or can you confirm it in an email?"** (ask for it in writing, even one line)
3. **"How would you like it credited?"** Offer: "San Francisco Estuary Institute. 2021. Hidden Nature SF, version 1.0. hidden-nature.org". Ask if they want something different.
4. **"Do you restrict anything, such as commercial use, ads, or redistributing the data files themselves?"** Say plainly if there is any chance of ads or charging.
5. **Optional: "Is mapping of the south-east of the city (the part Hidden Nature doesn't cover) going to be published, and roughly when?"**

## If they say...

| They say | You say |
|---|---|
| "I'm not the right person" | "Who would be? Could I have a name and email?" |
| "Email us / put it in writing" | "Of course. I already sent one to eigis@sfei.org on [date]. Could you tell me who is looking at it, so I can follow up with a name?" |
| "Yes, fine, just credit us" | "Thank you. Could you confirm that by email so I can keep it with the project? And is the credit line I read out correct?" |
| "We need to check" / "Ask our data team" | "No problem. When might I hear back? I'll wait before publishing anything." |
| "It's CC BY / some licence" | "Which exact licence and version, and where is it written down?" Write it down. |
| "Not for redistribution" | "Understood. Does that cover derived renderings and a heightmap, or only the original polygons? I wouldn't publish the polygons." |
| "No" | "Thank you for being clear. Is there a licence option or a version I could use, or a different dataset you suggest?" Do not argue. |

## Closing (10 seconds)

> "Thank you. To confirm: [repeat their answer in one sentence]. I'll put that in writing to you so we both have it. Who should I address it to?"

## Voicemail version (under 30 seconds)

> "Hi, this is [name], calling about the Hidden Nature SF historical habitats layer. I'm building a free educational 3D map of the San Francisco peninsula around 1769 and I'd like to confirm the terms for publishing derived results, with credit to SFEI. I emailed eigis@sfei.org on [date]. My number is [number] and my email is [email]. Thank you."

Say your number slowly, and twice if it is short.

## After the call

- Write the answer, the person's name, and the date in `docs/research/` (a short note) and, if you can, get it confirmed by email.
- **Until you have a written yes, nothing derived from the layer goes in git or on the web.** The repo already keeps those files ignored (`viewer/public/assets/real*/`, `docs/research/local/`, `pipeline/data/raw/`).
- Tell me the answer: a "yes" lets us plan hosting; a "no" means I rebuild without SFEI (the 17 ponds and habitat colours are the cost).
