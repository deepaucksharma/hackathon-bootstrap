# Email Template for New Relic Support

## To: New Relic Support / Product Team

### Subject: Enhancement Request - MSK Entity Format for Self-Managed Kafka Clusters

Dear New Relic Support Team,

I'm reaching out regarding a limitation we've discovered while attempting to monitor self-managed Kafka clusters using New Relic's Message Queues UI.

**Summary of Issue:**
We cannot get self-managed Kafka clusters to appear in the Message Queues UI, even when sending events in the exact AWS MSK format. Our investigation reveals this is due to entity synthesis requiring AWS cloud integration for security validation.

**What We've Accomplished:**
- Successfully reverse-engineered the exact MSK event format
- Verified all events are ingesting correctly into NRDB
- Built a working monitoring solution using custom dashboards
- Documented the complete technical analysis

**Business Need:**
We need a way to monitor self-managed Kafka clusters with the same UI experience as AWS MSK clusters. Many organizations run Kafka on-premises or in self-managed cloud deployments.

**Proposed Solution:**
Add an option to nri-kafka to output MSK-formatted events, allowing self-managed clusters to appear in the Message Queues UI without requiring AWS integration.

**Questions:**
1. Are there any undocumented configuration options we might have missed?
2. Is this enhancement already on your product roadmap?
3. Would you accept open-source contributions to nri-kafka for this feature?

I've attached comprehensive technical documentation of our investigation and proposed solutions. We're happy to schedule a call to discuss this further or provide additional details.

Thank you for considering this enhancement. This capability would significantly improve the Kafka monitoring experience for many New Relic customers.

Best regards,
[Your Name]
[Your Organization]

---

**Attachments:**
- NEW_RELIC_SUPPORT_TICKET.md (detailed technical analysis)
- UNIFIED_KAFKA_DOMAIN_MODEL.md (proposed solution architecture)
- Working code examples demonstrating the issue

**Account Details:**
- Account ID: 3630072
- Integration: nri-kafka v2.13.0
- Use Case: Self-managed Kafka monitoring