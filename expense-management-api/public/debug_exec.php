<?php
header("Content-Type: application/json");

$result = shell_exec("echo hello 2>&1");
$data = ["shell_exec_works" => ($result !== null && $result !== '')];

$pythonBin = "/home/rohit/Betopia/Hishab_Spending_Wisely/venv/bin/python3";
$data["python_exists"] = file_exists($pythonBin);

$modelPath = "/home/rohit/Betopia/Hishab_Spending_Wisely/expense-management-api/storage/app/ml/autocategorize.ftz";
$data["model_exists"] = file_exists($modelPath);

$cmd = sprintf("%s -c %s 2>&1", escapeshellcmd($pythonBin), escapeshellarg("import json, fasttext; m = fasttext.load_model('{$modelPath}'); labels, scores = m.predict('pizza', k=3); print(json.dumps([l for l in labels]))"));
$data["cmd"] = $cmd;
$py_result = shell_exec($cmd);
$data["python_output"] = $py_result;
$data["python_null"] = ($py_result === null);

echo json_encode($data, JSON_PRETTY_PRINT);
