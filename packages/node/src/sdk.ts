/* eslint-disable max-lines */
import { getCurrentHub, getIntegrationsToSetup, initAndBind, Integrations as CoreIntegrations } from '@sentry/core';
import { getMainCarrier, setHubOnCarrier } from '@sentry/hub';
import { Event, ExtractedNodeRequestData, SessionStatus, StackParser } from '@sentry/types';
import {
  addRequestDataToEvent as _addRequestDataToEvent,
  AddRequestDataToEventOptions,
  createStackParser,
  CrossPlatformRequest,
  extractRequestData as _extractRequestData,
  getGlobalObject,
  logger,
  stackParserFromStackParserOptions,
} from '@sentry/utils';
import * as cookie from 'cookie';
import * as domain from 'domain';
import * as url from 'url';

import { NodeClient } from './client';
import { Console, ContextLines, Http, LinkedErrors, OnUncaughtException, OnUnhandledRejection } from './integrations';
import { getModule } from './module';
import { nodeStackLineParser } from './stack-parser';
import { makeNodeTransport } from './transports';
import { NodeClientOptions, NodeOptions } from './types';

export const defaultIntegrations = [
  // Common
  new CoreIntegrations.InboundFilters(),
  new CoreIntegrations.FunctionToString(),
  new ContextLines(),
  // Native Wrappers
  new Console(),
  new Http(),
  // Global Handlers
  new OnUncaughtException(),
  new OnUnhandledRejection(),
  // Misc
  new LinkedErrors(),
];

/**
 * The Sentry Node SDK Client.
 *
 * To use this SDK, call the {@link init} function as early as possible in the
 * main entry module. To set context information or send manual events, use the
 * provided methods.
 *
 * @example
 * ```
 *
 * const { init } = require('@sentry/node');
 *
 * init({
 *   dsn: '__DSN__',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { configureScope } = require('@sentry/node');
 * configureScope((scope: Scope) => {
 *   scope.setExtra({ battery: 0.7 });
 *   scope.setTag({ user_mode: 'admin' });
 *   scope.setUser({ id: '4711' });
 * });
 * ```
 *
 * @example
 * ```
 *
 * const { addBreadcrumb } = require('@sentry/node');
 * addBreadcrumb({
 *   message: 'My Breadcrumb',
 *   // ...
 * });
 * ```
 *
 * @example
 * ```
 *
 * const Sentry = require('@sentry/node');
 * Sentry.captureMessage('Hello, world!');
 * Sentry.captureException(new Error('Good bye'));
 * Sentry.captureEvent({
 *   message: 'Manual',
 *   stacktrace: [
 *     // ...
 *   ],
 * });
 * ```
 *
 * @see {@link NodeOptions} for documentation on configuration options.
 */
export function init(options: NodeOptions = {}): void {
  const carrier = getMainCarrier();
  const autoloadedIntegrations = carrier.__SENTRY__?.integrations || [];

  options.defaultIntegrations =
    options.defaultIntegrations === false
      ? []
      : [
          ...(Array.isArray(options.defaultIntegrations) ? options.defaultIntegrations : defaultIntegrations),
          ...autoloadedIntegrations,
        ];

  if (options.dsn === undefined && process.env.SENTRY_DSN) {
    options.dsn = process.env.SENTRY_DSN;
  }

  if (options.tracesSampleRate === undefined && process.env.SENTRY_TRACES_SAMPLE_RATE) {
    const tracesSampleRate = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE);
    if (isFinite(tracesSampleRate)) {
      options.tracesSampleRate = tracesSampleRate;
    }
  }

  if (options.release === undefined) {
    const detectedRelease = getSentryRelease();
    if (detectedRelease !== undefined) {
      options.release = detectedRelease;
    } else {
      // If release is not provided, then we should disable autoSessionTracking
      options.autoSessionTracking = false;
    }
  }

  if (options.environment === undefined && process.env.SENTRY_ENVIRONMENT) {
    options.environment = process.env.SENTRY_ENVIRONMENT;
  }

  if (options.autoSessionTracking === undefined && options.dsn !== undefined) {
    options.autoSessionTracking = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  if ((domain as any).active) {
    setHubOnCarrier(carrier, getCurrentHub());
  }

  // TODO(v7): Refactor this to reduce the logic above
  const clientOptions: NodeClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeNodeTransport,
  };

  initAndBind(NodeClient, clientOptions);

  if (options.autoSessionTracking) {
    startSessionTracking();
  }
}

/**
 * This is the getter for lastEventId.
 *
 * @returns The last event id of a captured event.
 */
export function lastEventId(): string | undefined {
  return getCurrentHub().lastEventId();
}

/**
 * Call `flush()` on the current client, if there is one. See {@link Client.flush}.
 *
 * @param timeout Maximum time in ms the client should wait to flush its event queue. Omitting this parameter will cause
 * the client to wait until all events are sent before resolving the promise.
 * @returns A promise which resolves to `true` if the queue successfully drains before the timeout, or `false` if it
 * doesn't (or if there's no client defined).
 */
export async function flush(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<NodeClient>();
  if (client) {
    return client.flush(timeout);
  }
  __DEBUG_BUILD__ && logger.warn('Cannot flush events. No client defined.');
  return Promise.resolve(false);
}

/**
 * Call `close()` on the current client, if there is one. See {@link Client.close}.
 *
 * @param timeout Maximum time in ms the client should wait to flush its event queue before shutting down. Omitting this
 * parameter will cause the client to wait until all events are sent before disabling itself.
 * @returns A promise which resolves to `true` if the queue successfully drains before the timeout, or `false` if it
 * doesn't (or if there's no client defined).
 */
export async function close(timeout?: number): Promise<boolean> {
  const client = getCurrentHub().getClient<NodeClient>();
  if (client) {
    return client.close(timeout);
  }
  __DEBUG_BUILD__ && logger.warn('Cannot flush events and disable SDK. No client defined.');
  return Promise.resolve(false);
}

/**
 * Function that takes an instance of NodeClient and checks if autoSessionTracking option is enabled for that client
 */
export function isAutoSessionTrackingEnabled(client?: NodeClient): boolean {
  if (client === undefined) {
    return false;
  }
  const clientOptions = client && client.getOptions();
  if (clientOptions && clientOptions.autoSessionTracking !== undefined) {
    return clientOptions.autoSessionTracking;
  }
  return false;
}

/**
 * Returns a release dynamically from environment variables.
 */
export function getSentryRelease(fallback?: string): string | undefined {
  // Always read first as Sentry takes this as precedence
  if (process.env.SENTRY_RELEASE) {
    return process.env.SENTRY_RELEASE;
  }

  // This supports the variable that sentry-webpack-plugin injects
  const global = getGlobalObject();
  if (global.SENTRY_RELEASE && global.SENTRY_RELEASE.id) {
    return global.SENTRY_RELEASE.id;
  }

  return (
    // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
    process.env.GITHUB_SHA ||
    // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
    process.env.COMMIT_REF ||
    // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GITHUB_COMMIT_SHA ||
    process.env.VERCEL_GITLAB_COMMIT_SHA ||
    process.env.VERCEL_BITBUCKET_COMMIT_SHA ||
    // Zeit (now known as Vercel)
    process.env.ZEIT_GITHUB_COMMIT_SHA ||
    process.env.ZEIT_GITLAB_COMMIT_SHA ||
    process.env.ZEIT_BITBUCKET_COMMIT_SHA ||
    fallback
  );
}

/** Node.js stack parser */
export const defaultStackParser: StackParser = createStackParser(nodeStackLineParser(getModule));

/**
 * Enable automatic Session Tracking for the node process.
 */
function startSessionTracking(): void {
  const hub = getCurrentHub();
  hub.startSession();
  // Emitted in the case of healthy sessions, error of `mechanism.handled: true` and unhandledrejections because
  // The 'beforeExit' event is not emitted for conditions causing explicit termination,
  // such as calling process.exit() or uncaught exceptions.
  // Ref: https://nodejs.org/api/process.html#process_event_beforeexit
  process.on('beforeExit', () => {
    const session = hub.getScope()?.getSession();
    const terminalStates: SessionStatus[] = ['exited', 'crashed'];
    // Only call endSession, if the Session exists on Scope and SessionStatus is not a
    // Terminal Status i.e. Exited or Crashed because
    // "When a session is moved away from ok it must not be updated anymore."
    // Ref: https://develop.sentry.dev/sdk/sessions/
    if (session && !terminalStates.includes(session.status)) hub.endSession();
  });
}

/**
 * Add data from the given request to the given event
 *
 * (Note that there is no sister function to this one in `@sentry/browser`, because the whole point of this wrapper is
 * to pass along injected dependencies, which isn't necessary in a browser context. Isomorphic packages like
 * `@sentry/nextjs` should export directly from `@sentry/utils` in their browser index file.)
 *
 * @param event The event to which the request data will be added
 * @param req Request object
 * @param options.include Flags to control what data is included
 * @hidden
 */
export function addRequestDataToEvent(
  event: Event,
  req: CrossPlatformRequest,
  options?: Omit<AddRequestDataToEventOptions, 'deps'>,
): Event {
  return _addRequestDataToEvent(event, req, {
    ...options,
    // We have to inject these node-only dependencies because we can't import them in `@sentry/utils`, where the
    // original function lives
    deps: { cookie, url },
  });
}

/**
 * Normalize data from the request object, accounting for framework differences.
 *
 * (Note that there is no sister function to this one in `@sentry/browser`, because the whole point of this wrapper is
 * to inject dependencies, which isn't necessary in a browser context. Isomorphic packages like `@sentry/nextjs` should
 * export directly from `@sentry/utils` in their browser index file.)
 *
 * @param req The request object from which to extract data
 * @param options.keys An optional array of keys to include in the normalized data. Defaults to DEFAULT_REQUEST_KEYS if
 * not provided.
 * @returns An object containing normalized request data
 */
export function extractRequestData(
  req: CrossPlatformRequest,
  options?: {
    include?: string[];
  },
): ExtractedNodeRequestData {
  // We have to inject these node-only dependencies because we can't import them in `@sentry/utils`, where the original
  // function lives
  return _extractRequestData(req, { ...options, deps: { cookie, url } });
}
