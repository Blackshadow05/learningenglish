/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as conversacion from "../conversacion.js";
import type * as conversacionEscenarios from "../conversacionEscenarios.js";
import type * as escenarios from "../escenarios.js";
import type * as seed_vocabularioBasico from "../seed/vocabularioBasico.js";
import type * as vocabulario from "../vocabulario.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  conversacion: typeof conversacion;
  conversacionEscenarios: typeof conversacionEscenarios;
  escenarios: typeof escenarios;
  "seed/vocabularioBasico": typeof seed_vocabularioBasico;
  vocabulario: typeof vocabulario;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
