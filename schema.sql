-- Run automatically when the server starts (safe to run again). Works on MySQL 5.7+, 8.x and MariaDB 10.3+.
-- Passwords are stored as salted scrypt hashes, session tokens as SHA-256 hashes, never in plain text.

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  username_key VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'viewer',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_key (username_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per uploaded file.
CREATE TABLE IF NOT EXISTS documents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  file_type VARCHAR(16) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  scan_mode VARCHAR(16) NULL,
  scan_model VARCHAR(64) NULL,
  warnings TEXT NULL,
  uploaded_by INT UNSIGNED NULL,
  uploaded_at DATETIME NOT NULL,
  edited_by INT UNSIGNED NULL,
  edited_at DATETIME NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (edited_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Exactly what the scanner returned, before any cleanup (admins only).
CREATE TABLE IF NOT EXISTS doc_raw (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id INT UNSIGNED NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  label VARCHAR(255) NOT NULL,
  ms INT UNSIGNED NOT NULL DEFAULT 0,
  content MEDIUMTEXT NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Each table found in a document (one scanned page can hold several).
CREATE TABLE IF NOT EXISTS doc_tables (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id INT UNSIGNED NOT NULL,
  position SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  warnings TEXT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Column names plus the detected type: text, number or date (and a unit like % or $).
CREATE TABLE IF NOT EXISTS doc_columns (
  table_id INT UNSIGNED NOT NULL,
  col_index SMALLINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  data_type VARCHAR(8) NOT NULL DEFAULT 'text',
  unit VARCHAR(8) NULL,
  PRIMARY KEY (table_id, col_index),
  FOREIGN KEY (table_id) REFERENCES doc_tables (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per cell. value_text is what was read; value_num / value_date hold the same value
-- as a real number or date so charts can SUM, AVG and sort it in SQL ("$1,299.50" -> 1299.5).
CREATE TABLE IF NOT EXISTS doc_cells (
  table_id INT UNSIGNED NOT NULL,
  row_index INT UNSIGNED NOT NULL,
  col_index SMALLINT UNSIGNED NOT NULL,
  value_text TEXT NOT NULL,
  value_num DOUBLE NULL,
  value_date DATE NULL,
  PRIMARY KEY (table_id, row_index, col_index),
  FOREIGN KEY (table_id) REFERENCES doc_tables (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
