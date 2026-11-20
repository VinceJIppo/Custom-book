import { db } from "@/lib/db";
import type { ChildSnapshot } from "@/lib/schemas/child";
import type { BookOptions } from "@/lib/schemas/book";
import { loadBuiltInThemeFiles } from "@/lib/themes";

export const sampleChild: ChildSnapshot = {
  id: "child_test",
  firstName: "Theodore",
  nickname: "Teddy",
  age: 5,
  pronouns: "he",
  favorites: { colors: ["green"], animals: ["otters"], foods: ["pancakes"], activities: ["building forts"] },
  petName: "Biscuit",
  petType: "puppy",
  friends: ["Maya"],
  lesson: "bravery",
};

export const sampleOptions: BookOptions = {
  length: 16,
  readingLevel: "4-6",
  style: "bold-comic",
  trimSize: "square-8.5",
  includePet: true,
  includeFriend: true,
};

export const superhero = () => loadBuiltInThemeFiles().find((t) => t.id === "superhero-squad")!;

export async function resetDb() {
  await db.generationJob.deleteMany();
  await db.order.deleteMany();
  await db.page.deleteMany();
  await db.book.deleteMany();
  await db.childProfile.deleteMany();
  await db.theme.deleteMany({ where: { isBuiltIn: false } });
  await db.user.deleteMany();
}

export async function makeUser(email = "test@example.com") {
  return db.user.create({ data: { email, ageConfirmedAt: new Date() } });
}
