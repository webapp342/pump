package redisx

import (
	"context"
	"sync"

	"github.com/redis/go-redis/v9"
)

var (
	mu     sync.Mutex
	client *redis.Client
)

func Client(url string) *redis.Client {
	if url == "" {
		return nil
	}
	mu.Lock()
	defer mu.Unlock()
	if client == nil {
		opt, err := redis.ParseURL(url)
		if err != nil {
			opt = &redis.Options{Addr: "127.0.0.1:6379"}
		}
		client = redis.NewClient(opt)
	}
	return client
}

func Ping(ctx context.Context, url string) error {
	c := Client(url)
	if c == nil {
		return nil
	}
	return c.Ping(ctx).Err()
}
