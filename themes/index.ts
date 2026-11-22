/**
 * Built-in themes. To add one: drop a JSON file in this folder and import it
 * here. Every file is validated by ThemeConfigSchema at startup and in tests.
 */
import constructionCrew from "./construction-crew.json";
import dinosaurValley from "./dinosaur-valley.json";
import dragonKnight from "./dragon-knight.json";
import oceanDeep from "./ocean-deep.json";
import spaceExplorer from "./space-explorer.json";
import superheroSquad from "./superhero-squad.json";
import topsyTurvyTown from "./topsy-turvy-town.json";
import quietMeadow from "./quiet-meadow.json";
import wishingGarden from "./wishing-garden.json";

export const BUILT_IN_THEME_FILES: Record<string, unknown> = {
  "construction-crew.json": constructionCrew,
  "dinosaur-valley.json": dinosaurValley,
  "dragon-knight.json": dragonKnight,
  "ocean-deep.json": oceanDeep,
  "space-explorer.json": spaceExplorer,
  "superhero-squad.json": superheroSquad,
  "topsy-turvy-town.json": topsyTurvyTown,
  "quiet-meadow.json": quietMeadow,
  "wishing-garden.json": wishingGarden,
};
