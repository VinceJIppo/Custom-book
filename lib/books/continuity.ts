/**
 * Plain-code continuity checks on a manuscript, run before the editor's
 * rewrite so slips are always fixed:
 * - an accessory or outfit (glasses, a hat, a cape...) that shows up partway
 *   through the story without being part of anyone's look or the plan;
 * - glasses on a hero whose character sheet has none;
 * - a named animal called a different kind of animal ("Pip the puppy" when Pip is a fox).
 */
import type { CharacterGuide, EditorIssue, Outline } from "../schemas/story";

const ACCESSORIES = ["glasses", "spectacles", "goggles", "sunglasses", "hat", "cap", "crown", "helmet", "cape", "scarf", "mask", "backpack", "coat", "boots", "apron", "bow tie", "necklace"];
const ANIMALS = ["fox", "dog", "puppy", "cat", "kitten", "rabbit", "bunny", "bear", "mouse", "owl", "duck", "frog", "turtle", "tortoise", "squirrel", "hedgehog", "badger", "raccoon", "deer", "pig", "piglet", "horse", "pony", "unicorn", "dragon", "lion", "tiger", "elephant", "giraffe", "monkey", "penguin", "otter", "beaver", "wolf", "goat", "sheep", "lamb", "cow", "chicken", "hen", "bird", "robin", "parrot", "fish", "whale", "dolphin", "octopus", "snail", "bee", "butterfly", "ladybug", "dinosaur", "robot"];
/** Kinds that are the same animal at a different age or name. */
const SAME_KIND: Record<string, string> = { puppy: "dog", kitten: "cat", bunny: "rabbit", piglet: "pig", pony: "horse", lamb: "sheep", hen: "chicken", tortoise: "turtle" };
const kind = (w: string) => SAME_KIND[w] ?? w;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (w: string) => new RegExp(`(^|[^\\p{L}])${esc(w)}(e?s)?($|[^\\p{L}])`, "iu");

export function continuityProblems(
  pages: Array<{ pageNumber: number; text: string }>,
  outline: Pick<Outline, "characters" | "setups" | "continuity">,
  heroName: string,
  heroAppearance?: string,
): EditorIssue[] {
  const issues: EditorIssue[] = [];
  const planned = [
    ...outline.characters.map((c) => `${c.species} ${c.look}`),
    ...outline.setups.map((s) => s.item),
    ...outline.continuity.map((c) => c.fact),
    heroAppearance ?? "",
  ].join(" ");
  const sorted = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  // Accessories that appear out of nowhere partway through.
  for (const a of ACCESSORIES) {
    const re = word(a);
    const first = sorted.find((p) => re.test(p.text));
    if (!first || first.pageNumber === sorted[0]?.pageNumber) continue;
    if (re.test(planned)) continue;
    issues.push({
      page: first.pageNumber,
      problem: `"${a}" first appears on page ${first.pageNumber}, but no character has ${a} in their look and nothing in the plan sets it up. Characters can't put on new things in the middle of an adventure.`,
      fix: `Remove "${a}" from page ${first.pageNumber}, or, if it matters, show a character finding or putting it on and explain why.`,
    });
  }

  // Glasses on a hero whose sheet has none.
  if (heroAppearance && /no glasses/i.test(heroAppearance)) {
    const re = new RegExp(`${esc(heroName)}[^.!?]{0,60}(glasses|spectacles)|(glasses|spectacles)[^.!?]{0,60}${esc(heroName)}|\\b(his|her|their) (glasses|spectacles)`, "i");
    for (const p of sorted) {
      if (re.test(p.text)) {
        issues.push({ page: p.pageNumber, problem: `Page ${p.pageNumber} gives ${heroName} glasses, but ${heroName} doesn't wear glasses.`, fix: `Remove the glasses from page ${p.pageNumber}.` });
        break;
      }
    }
  }

  // A named animal called a different kind of animal.
  for (const c of outline.characters as CharacterGuide[]) {
    const own = ANIMALS.find((a) => word(a).test(c.species));
    if (!own) continue;
    const name = esc(c.name.split(/\s+/)[0]);
    for (const p of sorted) {
      const m = p.text.match(new RegExp(`${name},? the (?:[\\p{L}-]+ ){0,2}?(${ANIMALS.map(esc).join("|")})\\b`, "iu"));
      if (m && kind(m[1].toLowerCase()) !== kind(own)) {
        issues.push({ page: p.pageNumber, problem: `Page ${p.pageNumber} calls ${c.name} a ${m[1]}, but ${c.name} is ${c.species}.`, fix: `Call ${c.name} ${c.species.replace(/^an? /i, "the ")} (or just ${c.name}) on page ${p.pageNumber}, the same as every other page.` });
        break;
      }
    }
  }
  return issues.slice(0, 6);
}
