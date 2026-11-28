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
import sunnyClassroom from "./sunny-classroom.json";
import cottageHens from "./cottage-hens.json";
import firstBigSnow from "./first-big-snow.json";
import mistyWoods from "./misty-woods.json";
import lowTideShore from "./low-tide-shore.json";
import frostyWinterEvening from "./frosty-winter-evening.json";
import redRockLoop from "./red-rock-loop.json";
import breezyAutumnStreet from "./breezy-autumn-street.json";

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
  "sunny-classroom.json": sunnyClassroom,
  "cottage-hens.json": cottageHens,
  "first-big-snow.json": firstBigSnow,
  "misty-woods.json": mistyWoods,
  "low-tide-shore.json": lowTideShore,
  "frosty-winter-evening.json": frostyWinterEvening,
  "red-rock-loop.json": redRockLoop,
  "breezy-autumn-street.json": breezyAutumnStreet,
};
