CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'viewer',
  api_key VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'healthy',
  base_url VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id),
  user_id UUID REFERENCES users(id),
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  request_size INTEGER,
  response_size INTEGER,
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_logs_created_at ON api_logs(created_at);
CREATE INDEX idx_api_logs_service_id ON api_logs(service_id);
CREATE INDEX idx_api_logs_status_code ON api_logs(status_code);
CREATE INDEX idx_api_logs_user_id ON api_logs(user_id);
-- Serves "filter by service, newest first" (GET /logs?service=...) without a sort.
CREATE INDEX idx_api_logs_service_created ON api_logs(service_id, created_at DESC);

CREATE TABLE auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_events_created_at ON auth_events(created_at);
CREATE INDEX idx_auth_events_event_type ON auth_events(event_type);

CREATE TABLE rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  service_id UUID REFERENCES services(id),
  endpoint VARCHAR(500),
  request_count INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_violations_created_at ON rate_limit_violations(created_at);

-- SEED DATA

-- Insert users (100 total: 2 admins, 98 viewers)
INSERT INTO users (id, username, email, role, api_key, created_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'admin1', 'admin1@example.com', 'admin', 'api_key_admin1_secret', NOW()),
('550e8400-e29b-41d4-a716-446655440002', 'admin2', 'admin2@example.com', 'admin', 'api_key_admin2_secret', NOW());

INSERT INTO users (username, email, role, api_key, created_at)
SELECT
  'user' || i,
  'user' || i || '@example.com',
  'viewer',
  'api_key_user' || i || '_secret',
  NOW()
FROM generate_series(1, 98) AS t(i);

-- Insert 5 services
INSERT INTO services (id, name, slug, description, status, base_url, created_at) VALUES
('650e8400-e29b-41d4-a716-446655440001', 'User Service', 'user-service', 'Manages user accounts and profiles', 'healthy', 'https://users.api.example.com', NOW()),
('650e8400-e29b-41d4-a716-446655440002', 'Order Service', 'order-service', 'Handles order management', 'healthy', 'https://orders.api.example.com', NOW()),
('650e8400-e29b-41d4-a716-446655440003', 'Payment Service', 'payment-service', 'Processes payments and transactions', 'degraded', 'https://payments.api.example.com', NOW()),
('650e8400-e29b-41d4-a716-446655440004', 'Notification Service', 'notification-service', 'Sends notifications to users', 'healthy', 'https://notifications.api.example.com', NOW()),
('650e8400-e29b-41d4-a716-446655440005', 'Analytics Service', 'analytics-service', 'Tracks and analyzes user behavior', 'healthy', 'https://analytics.api.example.com', NOW());

-- Insert 10,000 API logs (realistic distribution over last 30 days)
INSERT INTO api_logs (service_id, user_id, endpoint, method, status_code, latency_ms, request_size, response_size, ip_address, user_agent, error_message, created_at)
SELECT
  (CASE (i % 5) WHEN 0 THEN '650e8400-e29b-41d4-a716-446655440001' WHEN 1 THEN '650e8400-e29b-41d4-a716-446655440002' WHEN 2 THEN '650e8400-e29b-41d4-a716-446655440003' WHEN 3 THEN '650e8400-e29b-41d4-a716-446655440004' ELSE '650e8400-e29b-41d4-a716-446655440005' END)::uuid,
  (SELECT id FROM users WHERE role = 'viewer' OFFSET (i % 98) LIMIT 1),
  CASE (i % 20) WHEN 0 THEN '/api/users' WHEN 1 THEN '/api/users/{id}' WHEN 2 THEN '/api/orders' WHEN 3 THEN '/api/orders/{id}' WHEN 4 THEN '/api/payments/charge' WHEN 5 THEN '/api/payments/{id}' WHEN 6 THEN '/api/notifications' WHEN 7 THEN '/api/notifications/{id}/read' WHEN 8 THEN '/api/events' ELSE '/api/analytics/summary' END,
  CASE (i % 5) WHEN 0 THEN 'GET' WHEN 1 THEN 'POST' WHEN 2 THEN 'PUT' WHEN 3 THEN 'DELETE' ELSE 'PATCH' END,
  CASE WHEN (i % 100) < 75 THEN 200 + (i % 100) WHEN (i % 100) < 90 THEN 400 + (i % 100) ELSE 500 + (i % 50) END,
  CASE WHEN ((i / 1000) % 3) = 2 THEN (i % 8000) + 20 ELSE (i % 3000) + 20 END,
  i % 5000,
  i % 50000,
  ('192.168.' || ((i / 256) % 256) || '.' || (i % 256))::inet,
  'Mozilla/5.0 (compatible; monitoring/1.0)',
  CASE WHEN (i % 100) >= 75 THEN 'Request failed' ELSE NULL END,
  NOW() - INTERVAL '1 second' * ((10000 - i) % (30 * 24 * 60 * 60))
FROM generate_series(1, 10000) AS t(i);

-- Insert 1,000 auth events
INSERT INTO auth_events (user_id, event_type, ip_address, user_agent, metadata, created_at)
SELECT
  (SELECT id FROM users WHERE role = 'viewer' OFFSET (i % 100) LIMIT 1),
  CASE WHEN (i % 100) < 60 THEN 'login_success' WHEN (i % 100) < 85 THEN 'login_failure' WHEN (i % 100) < 95 THEN 'token_invalid' ELSE 'token_expired' END,
  ('192.168.' || ((i / 256) % 256) || '.' || (i % 256))::inet,
  'Mozilla/5.0 (compatible; auth/1.0)',
  jsonb_build_object('success', (i % 100) < 60),
  NOW() - INTERVAL '1 second' * ((1000 - i) % (30 * 24 * 60 * 60))
FROM generate_series(1, 1000) AS t(i);

-- Insert 200 rate limit violations
INSERT INTO rate_limit_violations (user_id, service_id, endpoint, request_count, window_start, window_end, created_at)
SELECT
  (SELECT id FROM users WHERE role = 'viewer' OFFSET (i % 98) LIMIT 1),
  (CASE (i % 5) WHEN 0 THEN '650e8400-e29b-41d4-a716-446655440001' WHEN 1 THEN '650e8400-e29b-41d4-a716-446655440002' WHEN 2 THEN '650e8400-e29b-41d4-a716-446655440003' WHEN 3 THEN '650e8400-e29b-41d4-a716-446655440004' ELSE '650e8400-e29b-41d4-a716-446655440005' END)::uuid,
  '/api/endpoint' || (i % 10),
  (i % 1000) + 100,
  NOW() - INTERVAL '1 hour' * ((200 - i) % (30 * 24)),
  NOW() - INTERVAL '1 hour' * ((200 - i) % (30 * 24)) + INTERVAL '1 hour',
  NOW() - INTERVAL '1 day' * (i % 30)
FROM generate_series(1, 200) AS t(i);
