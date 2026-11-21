import type { Book } from "@prisma/client";
import { z } from "zod";
import { CastMemberSnapshotSchema, ChildSnapshotSchema } from "../schemas/child";
import { BookOptionsSchema } from "../schemas/book";
import { ThemeConfigSchema } from "../schemas/theme";
import { OutlineSchema } from "../schemas/story";
import type { StoryContext } from "../providers/story/types";

/** Parse the frozen JSON on a Book row into a typed story context. */
export function storyContextFor(book: Pick<Book, "childSnapshot" | "themeSnapshot" | "options"> & { castSnapshot?: Book["castSnapshot"] }): StoryContext {
  return {
    child: ChildSnapshotSchema.parse(book.childSnapshot),
    cast: book.castSnapshot ? z.array(CastMemberSnapshotSchema).parse(book.castSnapshot) : [],
    theme: ThemeConfigSchema.parse(book.themeSnapshot),
    options: BookOptionsSchema.parse(book.options),
  };
}

export function outlineFor(book: Pick<Book, "outline">) {
  return book.outline ? OutlineSchema.parse(book.outline) : null;
}
