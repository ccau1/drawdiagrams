// Package awsiicons is a built-in integration contributing AWS architecture
// icons to the drawing toolbox. Its Inject() declaration is merged by the
// server registry and consumed by the frontend anywhere draws are listed.
package awsicons

import "draw.local/manifest"

func icon(label, cat, keywords, body string) manifest.DrawDecl {
	return manifest.DrawDecl{
		ID:       "aws-" + label,
		Label:    label,
		Category: "AWS / " + cat,
		Kind:     "icon",
		SVG:      body,
		Keywords: keywords,
		Width:    64,
		Height:   64,
	}
}

// Inject declares everything this integration contributes to the app.
func Inject() manifest.Declaration {
	orange := "#e88434"
	dark := "#232f3e"
	box := func(inner string) string {
		return `<rect x="2" y="2" width="60" height="60" rx="8" fill="none" stroke="` + dark + `" stroke-width="2"/>` + inner
	}
	return manifest.Declaration{
		Name:        "aws-icons",
		Version:     "1.1.0",
		Description: "Extensive AWS architecture icons for infrastructure diagrams",
		Author:      "builtin",
		Builtin:     true,
		Draws: []manifest.DrawDecl{
			// Compute
			icon("EC2", "Compute", "server virtual machine vm instance compute", box(`<rect x="16" y="20" width="32" height="24" rx="3" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="24" y="27" width="16" height="10" rx="1" fill="`+orange+`"/>`)),
			icon("Lambda", "Compute", "function serverless faas compute", box(`<path d="M20 16 L34 32 L26 48" fill="none" stroke="`+orange+`" stroke-width="4" stroke-linecap="round"/><path d="M30 16 H44 L32 48" fill="none" stroke="`+orange+`" stroke-width="4" stroke-linecap="round"/>`)),
			icon("Auto-Scaling", "Compute", "scale scaling group asg capacity", box(`<path d="M14 24 h12 v-8 l16 16 h-12 v8 z" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linejoin="round"/>`)),
			icon("Batch", "Compute", "batch job processing compute", box(`<rect x="14" y="20" width="14" height="24" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="36" y="20" width="14" height="24" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M28 28 h8" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("EBS", "Compute", "block storage disk volume", box(`<ellipse cx="32" cy="24" rx="14" ry="5" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M18 24 v14 c0 3 6 6 14 6 c8 0 14 -3 14 -6 v-14" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("ELB", "Compute", "load balancer alb nlb classic", box(`<rect x="12" y="22" width="12" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="40" y="22" width="12" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M24 32 h16" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Fargate", "Compute", "container serverless compute ecs eks", box(`<path d="M32 14 L48 22 V38 L32 50 L16 38 V22 Z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 26 L40 30 V38 L32 42 L24 38 V30 Z" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Lightsail", "Compute", "vps simple server", box(`<path d="M32 14 L36 30 L52 30 L40 40 L44 56 L32 46 L20 56 L24 40 L12 30 L28 30 Z" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linejoin="round"/>`)),
			icon("Beanstalk", "Compute", "paas deploy application", box(`<path d="M32 46 V26" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="22" r="5" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M22 36 a10 10 0 0 1 20 0" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),

			// Storage
			icon("S3", "Storage", "bucket object storage file datastore", box(`<path d="M14 24 h36 v6 c0 10 -8 16 -18 16 c-10 0 -18 -6 -18 -16 z" fill="none" stroke="`+orange+`" stroke-width="3"/><line x1="14" y1="24" x2="50" y2="24" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("EFS", "Storage", "file system nfs shared", box(`<rect x="14" y="20" width="36" height="24" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><line x1="14" y1="28" x2="50" y2="28" stroke="`+orange+`" stroke-width="2"/><line x1="20" y1="36" x2="44" y2="36" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("FSx", "Storage", "windows lustre file server", box(`<rect x="16" y="18" width="32" height="28" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M22 28 h20 M22 34 h16" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Glacier", "Storage", "archive cold backup vault", box(`<path d="M18 48 L24 20 L32 36 L40 20 L46 48" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linejoin="round"/>`)),
			icon("Backup", "Storage", "backup restore snapshot", box(`<circle cx="32" cy="32" r="14" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 22 v12 l8 4" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),

			// Database
			icon("RDS", "Database", "sql database mysql postgres aurora", box(`<ellipse cx="32" cy="22" rx="14" ry="5" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M18 22 v18 c0 3 6 6 14 6 c8 0 14 -3 14 -6 v-18" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M18 31 c0 3 6 6 14 6 c8 0 14 -3 14 -6" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("DynamoDB", "Database", "nosql database key value", box(`<path d="M32 16 L46 24 V40 L32 48 L18 40 V24 Z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 16 V32 L18 24 M32 32 L46 24 M32 32 V48" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("ElastiCache", "Database", "cache redis memcached in memory", box(`<path d="M20 20 h24 v24 h-24 z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M24 28 h16 M24 34 h12" stroke="`+orange+`" stroke-width="2"/><path d="M44 18 v8" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),
			icon("Neptune", "Database", "graph database", box(`<circle cx="32" cy="32" r="14" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="32" r="5" fill="`+orange+`"/><path d="M20 20 l8 8 M44 20 l-8 8 M20 44 l8 -8 M44 44 l-8 -8" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("DocumentDB", "Database", "mongodb document json", box(`<rect x="18" y="18" width="28" height="28" rx="3" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M24 28 h16 M24 34 h12" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Keyspaces", "Database", "cassandra nosql wide column", box(`<circle cx="32" cy="28" r="8" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M26 42 h12" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),
			icon("Timestream", "Database", "time series database", box(`<circle cx="32" cy="32" r="13" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 22 v10 l6 6" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),

			// Networking
			icon("VPC", "Networking", "network subnet cloud private", box(`<rect x="14" y="18" width="36" height="28" rx="4" fill="none" stroke="`+orange+`" stroke-width="3" stroke-dasharray="5 4"/><circle cx="32" cy="32" r="6" fill="`+orange+`"/>`)),
			icon("CloudFront", "Networking", "cdn content delivery edge cache", box(`<circle cx="32" cy="32" r="15" fill="none" stroke="`+orange+`" stroke-width="3"/><ellipse cx="32" cy="32" rx="15" ry="6" fill="none" stroke="`+orange+`" stroke-width="2"/><line x1="32" y1="17" x2="32" y2="47" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("API-Gateway", "Networking", "api rest http endpoint", box(`<path d="M24 16 L14 32 L24 48" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M40 16 L50 32 L40 48" fill="none" stroke="`+orange+`" stroke-width="3"/><line x1="27" y1="32" x2="37" y2="32" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("Route-53", "Networking", "dns domain name", box(`<circle cx="32" cy="32" r="14" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M24 32 h16" stroke="`+orange+`" stroke-width="3"/><circle cx="28" cy="32" r="2" fill="`+orange+`"/><circle cx="36" cy="32" r="2" fill="`+orange+`"/>`)),
			icon("Direct-Connect", "Networking", "dedicated network connection", box(`<rect x="14" y="22" width="16" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="34" y="22" width="16" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M30 32 h4" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("Transit-Gateway", "Networking", "tgw hub spoke network", box(`<circle cx="32" cy="32" r="8" fill="`+orange+`"/><circle cx="32" cy="18" r="4" fill="none" stroke="`+orange+`" stroke-width="2"/><circle cx="32" cy="46" r="4" fill="none" stroke="`+orange+`" stroke-width="2"/><circle cx="18" cy="32" r="4" fill="none" stroke="`+orange+`" stroke-width="2"/><circle cx="46" cy="32" r="4" fill="none" stroke="`+orange+`" stroke-width="2"/><path d="M32 26 v-4 M32 38 v4 M26 32 h-4 M38 32 h4" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("App-Mesh", "Networking", "service mesh proxy", box(`<circle cx="20" cy="20" r="4" fill="`+orange+`"/><circle cx="44" cy="20" r="4" fill="`+orange+`"/><circle cx="20" cy="44" r="4" fill="`+orange+`"/><circle cx="44" cy="44" r="4" fill="`+orange+`"/><circle cx="32" cy="32" r="5" fill="none" stroke="`+orange+`" stroke-width="2"/><path d="M24 24 l6 6 M40 24 l-6 6 M24 40 l6 -6 M40 40 l-6 -6" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("PrivateLink", "Networking", "private endpoint link", box(`<path d="M20 32 h-6 M50 32 h-6 M32 20 v-6 M32 50 v-6" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="10" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),

			// Security
			icon("IAM", "Security", "identity access role user policy", box(`<path d="M32 16 a8 8 0 0 1 8 8 v4 h-16 v-4 a8 8 0 0 1 8 -8" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M20 38 c0 7 5 12 12 12 s12 -5 12 -12" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("KMS", "Security", "key encryption secret", box(`<circle cx="32" cy="26" r="6" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M28 30 v14 M36 30 v14" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("WAF", "Security", "firewall web application", box(`<path d="M14 18 h36 v28 h-36 z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M18 26 h28 M18 32 h22 M18 38 h28" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Shield", "Security", "ddos protection", box(`<path d="M32 14 L46 22 V34 C46 42 32 50 32 50 C32 50 18 42 18 34 V22 Z" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("Secrets-Manager", "Security", "secret vault password", box(`<rect x="22" y="18" width="20" height="28" rx="3" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="34" r="3" fill="`+orange+`"/><path d="M32 26 v4" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("Cognito", "Security", "auth user pool signin", box(`<circle cx="32" cy="26" r="7" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M20 46 c0 -7 5 -11 12 -11 s12 4 12 11" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("GuardDuty", "Security", "threat detection", box(`<path d="M32 14 L44 22 V36 C44 44 32 50 32 50 C32 50 20 44 20 36 V22 Z" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="34" r="4" fill="`+orange+`"/>`)),
			icon("Certificate-Manager", "Security", "tls ssl certificate acm", box(`<rect x="20" y="16" width="24" height="32" rx="3" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="28" r="4" fill="none" stroke="`+orange+`" stroke-width="2"/><path d="M32 36 v6" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),

			// Messaging
			icon("SQS", "Messaging", "queue message async", box(`<rect x="16" y="22" width="32" height="9" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="20" y="34" width="24" height="9" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("SNS", "Messaging", "notification pub sub topic", box(`<circle cx="32" cy="32" r="5" fill="`+orange+`"/><circle cx="32" cy="32" r="11" fill="none" stroke="`+orange+`" stroke-width="2"/><path d="M41 23 a13 13 0 0 1 0 18 M23 41 a13 13 0 0 1 0 -18" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),
			icon("EventBridge", "Messaging", "event bus routing serverless", box(`<path d="M16 32 h32" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="5" fill="`+orange+`"/><circle cx="20" cy="32" r="3" fill="none" stroke="`+orange+`" stroke-width="2"/><circle cx="44" cy="32" r="3" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Kinesis", "Messaging", "stream data real time", box(`<path d="M18 20 q14 0 14 12 q0 12 14 12" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/><path d="M18 32 q14 0 14 12 q0 12 14 12" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),
			icon("MSK", "Messaging", "kafka streaming managed", box(`<rect x="16" y="22" width="8" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="28" y="16" width="8" height="32" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="40" y="22" width="8" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("SES", "Messaging", "email smtp notification", box(`<rect x="14" y="22" width="36" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M14 24 L32 36 L50 24" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("AppSync", "Messaging", "graphql sync realtime api", box(`<path d="M32 14 v36" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/><path d="M18 22 l14 -8 l14 8 M18 42 l14 8 l14 -8" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),

			// Containers
			icon("ECS", "Containers", "container service docker", box(`<rect x="20" y="18" width="24" height="28" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M20 26 h24 M20 34 h24" stroke="`+orange+`" stroke-width="2"/><circle cx="32" cy="22" r="2" fill="`+orange+`"/><circle cx="32" cy="30" r="2" fill="`+orange+`"/><circle cx="32" cy="38" r="2" fill="`+orange+`"/>`)),
			icon("EKS", "Containers", "kubernetes container k8s cluster", box(`<path d="M32 16 L45 23 V39 L32 48 L19 39 V23 Z" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="31" r="7" fill="none" stroke="`+orange+`" stroke-width="3"/><line x1="32" y1="24" x2="32" y2="38" stroke="`+orange+`" stroke-width="2"/><line x1="25" y1="31" x2="39" y2="31" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("ECR", "Containers", "registry repository image", box(`<rect x="16" y="18" width="32" height="28" rx="3" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M24 28 h16 M24 34 h16" stroke="`+orange+`" stroke-width="2"/><path d="M42 14 v8" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("App-Runner", "Containers", "deploy web app container", box(`<path d="M18 24 l14 -8 l14 8 v16 l-14 8 l-14 -8 z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 16 v36" stroke="`+orange+`" stroke-width="2"/>`)),

			// Serverless
			icon("Step-Functions", "Serverless", "workflow state machine orchestration", box(`<rect x="14" y="28" width="8" height="8" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="28" y="28" width="8" height="8" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="42" y="28" width="8" height="8" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M22 32 h6 M36 32 h6" stroke="`+orange+`" stroke-width="2"/>`)),

			// Analytics
			icon("Glue", "Analytics", "etl data catalog integration", box(`<path d="M22 18 h20 v28 h-20 z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M22 26 h20 M22 34 h20" stroke="`+orange+`" stroke-width="2"/><circle cx="26" cy="22" r="1.5" fill="`+orange+`"/><circle cx="26" cy="30" r="1.5" fill="`+orange+`"/><circle cx="26" cy="38" r="1.5" fill="`+orange+`"/>`)),
			icon("Athena", "Analytics", "sql query data lake", box(`<path d="M32 14 L44 22 V42 L32 50 L20 42 V22 Z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M28 28 h8" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Redshift", "Analytics", "data warehouse sql analytics", box(`<path d="M20 18 h24 v28 h-24 z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M20 24 h24 M20 30 h24 M20 36 h24" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("EMR", "Analytics", "hadoop spark big data", box(`<circle cx="22" cy="28" r="6" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="42" cy="28" r="6" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="40" r="6" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M26 30 l4 6 M38 30 l-4 6" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("QuickSight", "Analytics", "bi dashboard visualization", box(`<rect x="14" y="30" width="8" height="16" rx="1" fill="none" stroke="`+orange+`" stroke-width="2"/><rect x="28" y="22" width="8" height="24" rx="1" fill="none" stroke="`+orange+`" stroke-width="2"/><rect x="42" y="26" width="8" height="20" rx="1" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Lake-Formation", "Analytics", "data lake governance", box(`<path d="M14 30 c0 -10 36 -10 36 0 c0 10 -36 10 -36 0" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M14 38 c0 -10 36 -10 36 0 c0 10 -36 10 -36 0" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),

			// Management
			icon("CloudWatch", "Management", "logs metrics observability", box(`<path d="M16 40 L24 30 L30 36 L38 24 L48 34" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="46" x2="48" y2="46" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("CloudFormation", "Management", "iac template stack infrastructure", box(`<rect x="18" y="34" width="12" height="14" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="34" y="22" width="12" height="26" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M30 38 l4 4" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("CloudTrail", "Management", "audit governance compliance", box(`<path d="M14 36 h36" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="36" r="5" fill="none" stroke="`+orange+`" stroke-width="2"/><circle cx="40" cy="36" r="5" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Config", "Management", "configuration compliance rules", box(`<rect x="16" y="20" width="32" height="24" rx="3" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M22 32 l4 4 l10 -10" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`)),
			icon("Systems-Manager", "Management", "ssm patch automation ops", box(`<path d="M20 24 h24 v16 h-24 z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M26 32 h12" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("Organizations", "Management", "multi account governance", box(`<rect x="20" y="16" width="24" height="12" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="14" y="36" width="14" height="12" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="36" y="36" width="14" height="12" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 28 v4 M25 32 h14" stroke="`+orange+`" stroke-width="2"/>`)),

			// AI / ML
			icon("SageMaker", "AI-ML", "machine learning model training", box(`<path d="M28 16 h8 v8 h-8 z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 24 v14" stroke="`+orange+`" stroke-width="3"/><circle cx="26" cy="42" r="4" fill="none" stroke="`+orange+`" stroke-width="2"/><circle cx="38" cy="42" r="4" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Bedrock", "AI-ML", "foundation model ai generative", box(`<path d="M16 40 L32 16 L48 40 Z" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="34" r="4" fill="`+orange+`"/>`)),
			icon("Comprehend", "AI-ML", "nlp text analysis", box(`<rect x="18" y="22" width="28" height="20" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M24 30 h4 M32 30 h8" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("Rekognition", "AI-ML", "image video recognition", box(`<circle cx="32" cy="32" r="10" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="32" r="4" fill="`+orange+`"/>`)),
		},
	}
}
