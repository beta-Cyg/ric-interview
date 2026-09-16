package main

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"time"

	_ "modernc.org/sqlite"
)

func main() {
	baseDir := os.Getenv("DATA_DIR")
	if baseDir == "" {
		baseDir = sourceDirectory()
	}
	dataPath := filepath.Join(baseDir, "data", "ric_course_sample_dataset.json")
	databasePath := filepath.Join(baseDir, "data", "ric-courses.sqlite")

	db, err := sql.Open("sqlite", databasePath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		log.Fatal(err)
	}

	forceInit := len(os.Args) > 1 && os.Args[1] == "--init-db"
	if forceInit || !databaseReady(db) {
		if err := initializeDatabase(db, dataPath); err != nil {
			log.Fatalf("初始化数据库失败: %v", err)
		}
		log.Println("数据库初始化完成")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", healthHandler(db))
	mux.HandleFunc("/api/courses", coursesHandler(db))
	mux.HandleFunc("/api/courses/", courseDetailHandler(db))
	mux.HandleFunc("/api/departments", departmentsHandler(db))
	mux.HandleFunc("/api/conflicts", conflictsHandler(db))

	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = "127.0.0.1:3001"
	}

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("API available at http://%s", addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func sourceDirectory() string {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		log.Fatal("cannot locate backend directory")
	}
	return filepath.Dir(filename)
}

// readDataset 读取官方提供的数据集文件。该文件因 RIC 数据保密要求未纳入 Git 仓库，
// clone 后需要自行放入 backend/data/ 目录。
func readDataset(dataPath string) ([]byte, error) {
	content, err := os.ReadFile(dataPath)
	if err != nil {
		return nil, fmt.Errorf(
			"找不到课程数据文件 %s。该文件由 RIC 提供且未纳入 Git 仓库，请将 Starter 中的 backend/data/ 复制到本目录后重试（原始错误: %w）",
			dataPath, err,
		)
	}
	return content, nil
}
