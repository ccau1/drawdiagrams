module draw.local/server

go 1.23

require (
	draw.local/integrations/aws-icons v0.0.0
	draw.local/integrations/emoji-reactions v0.0.0
	draw.local/integrations/uml-shapes v0.0.0
)

require (
	draw.local/manifest v0.0.0
	github.com/jackc/pgx/v5 v5.7.1
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.27.0 // indirect
	golang.org/x/sync v0.8.0 // indirect
	golang.org/x/text v0.18.0 // indirect
)

replace draw.local/integrations/aws-icons => ../integrations/aws-icons

replace draw.local/integrations/uml-shapes => ../integrations/uml-shapes

replace draw.local/integrations/emoji-reactions => ../integrations/emoji-reactions

replace draw.local/manifest => ../integrations/manifest
