import type { GenerationJob, Prisma } from "@prisma/client";
import type { Usage } from "../providers/types";

export interface JobOutcome {
  result?: Prisma.InputJsonValue;
  usage?: Usage;
}

export type JobHandler = (job: GenerationJob) => Promise<JobOutcome>;
