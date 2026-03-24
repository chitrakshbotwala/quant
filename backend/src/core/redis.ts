import { EventEmitter } from 'events';
import dotenv from 'dotenv';
import path from 'path';
import Redis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';

dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: true });
dotenv.config({ override: true });

type MessageHandler = (channel: string, message: string) => void;

type RedisSubscriber = {
	subscribe: (...channels: string[]) => Promise<void>;
	on: (event: 'message', handler: MessageHandler) => void;
};

type RedisClient = {
	connect: () => Promise<void>;
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string | number) => Promise<unknown>;
	setnx: (key: string, value: string | number) => Promise<number>;
	publish: (channel: string, message: string) => Promise<number>;
	ping: () => Promise<string>;
	duplicate: () => RedisSubscriber;
};

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
const redisUrl = process.env.REDIS_URL?.trim();
const upstashReadOnly = (process.env.UPSTASH_READ_ONLY || '').toLowerCase() === 'true';

function createIoredisClient(url: string): { redis: RedisClient; redisSub: RedisSubscriber } {
	const base = new Redis(url, {
		maxRetriesPerRequest: 5,
		enableOfflineQueue: true
	});

	const onError = (err: unknown) => {
		console.warn('[redis] connection error:', String(err));
	};

	base.on('error', onError);
	const sub = base.duplicate();
	sub.on('error', onError);

	const redis: RedisClient = {
		connect: async () => {
			await base.connect();
		},
		get: async (key) => base.get(key),
		set: async (key, value) => base.set(key, String(value)),
		setnx: async (key, value) => base.setnx(key, String(value)),
		publish: async (channel, message) => base.publish(channel, message),
		ping: async () => base.ping(),
		duplicate: () => redisSub
	};

	const redisSub: RedisSubscriber = {
		subscribe: async (...channels: string[]) => {
			await sub.subscribe(...channels);
		},
		on: (event, handler) => {
			sub.on(event, handler);
		}
	};

	return { redis, redisSub };
}

function createUpstashClient(url: string, token: string): { redis: RedisClient; redisSub: RedisSubscriber } {
	const upstash = new UpstashRedis({ url, token });
	const bus = new EventEmitter();
	const localStore = new Map<string, string>();
	let localFallback = upstashReadOnly;

	if (upstashReadOnly) {
		console.warn('[redis] UPSTASH_READ_ONLY=true, using local in-memory state for write operations');
	}

	function enableLocalFallback(err: unknown) {
		if (!localFallback) {
			localFallback = true;
			const msg = String(err);
			if (msg.includes('NOPERM')) {
				console.warn('[redis] Upstash token has read-only permissions. Falling back to in-memory state.');
			} else {
				console.warn('[redis] Upstash command failed, switching to in-memory fallback:', msg);
			}
		}
	}

	class LocalSubscriber implements RedisSubscriber {
		private channels = new Set<string>();
		private handler: MessageHandler | null = null;

		constructor() {
			bus.on('message', (channel: string, message: string) => {
				if (this.handler && this.channels.has(channel)) {
					this.handler(channel, message);
				}
			});
		}

		async subscribe(...channels: string[]) {
			channels.forEach((channel) => this.channels.add(channel));
		}

		on(event: 'message', handler: MessageHandler) {
			if (event === 'message') {
				this.handler = handler;
			}
		}
	}

	const primarySubscriber = new LocalSubscriber();

	function localGet(key: string) {
		return localStore.get(key) ?? null;
	}

	function localSet(key: string, value: string | number) {
		localStore.set(key, String(value));
		return 'OK';
	}

	function localSetnx(key: string, value: string | number) {
		if (localStore.has(key)) return 0;
		localStore.set(key, String(value));
		return 1;
	}

	const redis: RedisClient = {
		connect: async () => Promise.resolve(),
		get: async (key) => {
			if (localFallback) {
				return localGet(key);
			}
			try {
				const value = await upstash.get(key);
				if (value === null || value === undefined) return null;
				return String(value);
			} catch (err) {
				enableLocalFallback(err);
				return localGet(key);
			}
		},
		set: async (key, value) => {
			if (localFallback) {
				return localSet(key, value);
			}
			try {
				return await upstash.set(key, String(value));
			} catch (err) {
				enableLocalFallback(err);
				return localSet(key, value);
			}
		},
		setnx: async (key, value) => {
			if (localFallback) {
				return localSetnx(key, value);
			}
			try {
				const result = await upstash.set(key, String(value), { nx: true });
				return result ? 1 : 0;
			} catch (err) {
				enableLocalFallback(err);
				return localSetnx(key, value);
			}
		},
		publish: async (channel, message) => {
			bus.emit('message', channel, message);
			if (localFallback) {
				return 1;
			}
			try {
				const published = await upstash.publish(channel, message);
				return Number(published || 0);
			} catch (err) {
				enableLocalFallback(err);
				return 1;
			}
		},
		ping: async () => {
			if (!localFallback) {
				try {
					await upstash.ping();
				} catch (err) {
					enableLocalFallback(err);
				}
			}
			return 'PONG';
		},
		duplicate: () => new LocalSubscriber()
	};

	return { redis, redisSub: primarySubscriber };
}

function createMemoryClient(): { redis: RedisClient; redisSub: RedisSubscriber } {
	const store = new Map<string, string>();
	const bus = new EventEmitter();

	class LocalSubscriber implements RedisSubscriber {
		private channels = new Set<string>();
		private handler: MessageHandler | null = null;

		constructor() {
			bus.on('message', (channel: string, message: string) => {
				if (this.handler && this.channels.has(channel)) {
					this.handler(channel, message);
				}
			});
		}

		async subscribe(...channels: string[]) {
			channels.forEach((channel) => this.channels.add(channel));
		}

		on(event: 'message', handler: MessageHandler) {
			if (event === 'message') {
				this.handler = handler;
			}
		}
	}

	const primarySubscriber = new LocalSubscriber();

	const redis: RedisClient = {
		connect: async () => Promise.resolve(),
		get: async (key) => store.get(key) ?? null,
		set: async (key, value) => {
			store.set(key, String(value));
			return 'OK';
		},
		setnx: async (key, value) => {
			if (store.has(key)) return 0;
			store.set(key, String(value));
			return 1;
		},
		publish: async (channel, message) => {
			bus.emit('message', channel, message);
			return 1;
		},
		ping: async () => 'PONG',
		duplicate: () => new LocalSubscriber()
	};

	return { redis, redisSub: primarySubscriber };
}

let clients: { redis: RedisClient; redisSub: RedisSubscriber };

if (upstashUrl && upstashToken) {
	clients = createUpstashClient(upstashUrl, upstashToken);
	console.log('[redis] using Upstash REST mode');
} else if (redisUrl) {
 	clients = createIoredisClient(redisUrl);
} else {
	clients = createMemoryClient();
	console.warn('[redis] no REDIS_URL or Upstash credentials found, using in-memory fallback');
}

export const redis = clients.redis;
export const redisSub = clients.redisSub;
