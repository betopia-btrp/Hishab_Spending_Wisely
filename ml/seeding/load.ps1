# SpendWise — Load generated TSV data into Docker Postgres
# Usage:  .\ml\seeding\load.ps1

$container = "spendwise-db"
$dbUser = "spendwise"
$dbName = "spendwise"
$tsvDir = "ml/seeding/output"
$sqlFile = "ml/seeding/import.sql"

Write-Host "[1/3] Copying TSV files to container..."
docker cp "$tsvDir/." "${container}:/tmp/seeding/"

Write-Host "[2/3] Piping import.sql into psql..."
Get-Content $sqlFile | docker exec -i $container psql -U $dbUser -d $dbName

Write-Host "[3/3] Done."
