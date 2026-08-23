module draw.local/server

go 1.23

require (
	draw.local/integrations/aws-icons v0.0.0
	draw.local/integrations/drawboard v0.0.0
	draw.local/integrations/emoji-reactions v0.0.0
	draw.local/integrations/excalidraw v0.0.0
	draw.local/integrations/uml-shapes v0.0.0
)

require (
	draw.local/manifest v0.0.0
	github.com/coreos/go-oidc/v3 v3.11.0
	github.com/jackc/pgx/v5 v5.7.1
	golang.org/x/oauth2 v0.24.0
)

require (
	github.com/go-jose/go-jose/v4 v4.0.4 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	golang.org/x/crypto v0.27.0 // indirect
	golang.org/x/sync v0.8.0 // indirect
	golang.org/x/text v0.18.0 // indirect
)

replace draw.local/integrations/aws-icons => ../integrations/aws-icons

replace draw.local/integrations/devops-icons => ../integrations/devops-icons

replace draw.local/integrations/drawboard => ../integrations/drawboard

replace draw.local/integrations/emoji-reactions => ../integrations/emoji-reactions

replace draw.local/integrations/excalidraw => ../integrations/excalidraw

replace draw.local/integrations/messenger-icons => ../integrations/messenger-icons

replace draw.local/integrations/uml-shapes => ../integrations/uml-shapes

replace draw.local/manifest => ../integrations/manifest
