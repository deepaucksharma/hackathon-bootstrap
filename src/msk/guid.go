package msk

import (
	"encoding/base64"
	"fmt"
)

// EntityType represents the MSK entity types
type EntityType string

const (
	EntityTypeCluster EntityType = "AWSMSKCLUSTER"
	EntityTypeBroker  EntityType = "AWSMSKBROKER"
	EntityTypeTopic   EntityType = "AWSMSKTOPIC"
)

// GenerateEntityGUID generates a New Relic entity GUID in the format expected by the Message Queues UI
// Format: accountId|INFRA|entityType|base64(identifier)
func GenerateEntityGUID(entityType EntityType, accountID, clusterName string, additional interface{}) string {
	var identifier string

	switch entityType {
	case EntityTypeCluster:
		identifier = fmt.Sprintf("%s:%s", clusterName, accountID)
	case EntityTypeBroker:
		identifier = fmt.Sprintf("%s:%s:%v", clusterName, accountID, additional)
	case EntityTypeTopic:
		identifier = fmt.Sprintf("%s:%s:%v", clusterName, accountID, additional)
	}

	// Format: accountId|INFRA|entityType|base64(identifier)
	encoded := base64.StdEncoding.EncodeToString([]byte(identifier))
	return fmt.Sprintf("%s|INFRA|%s|%s", accountID, entityType, encoded)
}