import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  terrain: router({
    generate: publicProcedure
      .input(
        z.object({
          bounds: z
            .object({
              north: z.number(),
              south: z.number(),
              east: z.number(),
              west: z.number(),
            })
            .refine((b) => b.north > b.south && b.east > b.west, {
              message: "Selection must have positive area (north > south, east > west).",
            }),
          exaggeration: z.number(),
          baseHeight: z.number(),
          modelWidth: z.number(),
          resolution: z.enum(["low", "medium", "high", "ultra"]),
          shape: z.enum(["rectangle", "oval"]),
          planet: z.enum(["earth", "mars", "moon", "venus"]),
          lithophane: z.boolean(),
          invert: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        const { TerrainGenerator } = await import("./terrain");
        const generator = new TerrainGenerator(input);
        const stlBuffer = await generator.generate();

        return {
          stl: stlBuffer.toString("base64"),
          fallbackTriggered: generator.fallbackTriggered,
          elevationSource: generator.elevationSource,
          moonUsedKaguya: generator.moonUsedKaguya,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
