import { c as REQUIRED_CORE_PACKAGES, d as compatEnforcement, f as readInstalledVersion, i as assertSupportedInstallation, l as SUPPORTED_DSH_RELEASES, n as MultiRootCompatService, o as CORE_PACKAGES, s as OPTIONAL_CORE_PACKAGES, t as DshCompatUnsupportedError, u as classifyInstallation } from "./compat-CMwLyOO2.js";
import { a as composeInstructionMessage, c as createInstructionMessage, l as instructionsApi, r as PLUGIN_SOURCE, t as DEFAULT_MAX_BYTES, u as renderInstructions } from "./instructions-DH4AhIuZ.js";
import { n as widenConfined, t as MultiRootSandboxProvider } from "./sandbox-SDtqJ4nT.js";
import { a as classifyStoredRoots, c as indexedStatuses, f as resolveRootRef, i as canonicalRoot, l as isCanonicallyUnder, m as validateRootCandidate, n as additionalRootId, p as sameCanonicalPath, r as availableRoots, s as expandRootInput, t as RootValidationError, u as removeStatusAt } from "./roots-DejK8QSE.js";
import { t as MultiRootFileSystem } from "./fs-D_Sw3o5z.js";
import { MultiRootScopeService, renderWorkspaceRootsContext, sanitizeAdditionalRoots } from "./scope.js";
import { a as REGISTRY_CONTENDED_MESSAGE, c as RegistryAuthorityLease, i as MultiRootRegistry, l as RegistryLeaseContendedError, n as DOMAIN_NAME, r as MAX_ALIAS_LENGTH, s as multiRootDomainSpec, t as COMMON_ROOT_ID_PREFIX } from "./registry-Br93ZNJk.js";
import { a as parseFoldersCommand, c as revealArgv, d as parseFilePreview, f as parseFilesView, h as parseRootsView, l as PANEL_CHANNEL, m as parseRevealedView, n as COMMON_MARKER, o as renderRootsReport, p as parsePanelCall, s as resolvePanelPrimaryRoot, t as COMMAND_NAME, u as PANEL_ENDPOINTS } from "./command-XsWzcNJF.js";
//#region src/index.ts
/**
* Carrier plugin face for the bare-package-name loader row (see the module
* doc). It deliberately provides nothing: every host responsibility is owned
* by a subpath entry, and this row exists only so the web client-module scan
* can locate the package root and read its `dsh.client` declaration.
*/
const inject = [];
function apply() {}
//#endregion
export { COMMAND_NAME, COMMON_MARKER, COMMON_ROOT_ID_PREFIX, CORE_PACKAGES, DEFAULT_MAX_BYTES, DOMAIN_NAME, DshCompatUnsupportedError, MAX_ALIAS_LENGTH, MultiRootCompatService, MultiRootFileSystem, MultiRootRegistry, MultiRootSandboxProvider, MultiRootScopeService, OPTIONAL_CORE_PACKAGES, PANEL_CHANNEL, PANEL_ENDPOINTS, PLUGIN_SOURCE, REGISTRY_CONTENDED_MESSAGE, REQUIRED_CORE_PACKAGES, RegistryAuthorityLease, RegistryLeaseContendedError, RootValidationError, SUPPORTED_DSH_RELEASES, additionalRootId, apply, assertSupportedInstallation, availableRoots, canonicalRoot, classifyInstallation, classifyStoredRoots, compatEnforcement, composeInstructionMessage, createInstructionMessage, expandRootInput, indexedStatuses, inject, instructionsApi, isCanonicallyUnder, multiRootDomainSpec, parseFilePreview, parseFilesView, parseFoldersCommand, parsePanelCall, parseRevealedView, parseRootsView, readInstalledVersion, removeStatusAt, renderInstructions, renderRootsReport, renderWorkspaceRootsContext, resolvePanelPrimaryRoot, resolveRootRef, revealArgv, sameCanonicalPath, sanitizeAdditionalRoots, validateRootCandidate, widenConfined };
