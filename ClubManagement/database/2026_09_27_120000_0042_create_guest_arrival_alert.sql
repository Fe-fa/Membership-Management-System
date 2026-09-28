-- Baseline schema for dbo.Guest_arrival_alert. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Guest_arrival_alert', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Guest_arrival_alert] (
        [guest_arrival_alert_id] bigint IDENTITY(1,1) NOT NULL,
        [visit_id] bigint NOT NULL,
        [host_profile_id] bigint NOT NULL,
        [guest_name] nvarchar(200) NOT NULL,
        [host_member_name] nvarchar(200) NOT NULL,
        [message] nvarchar(500) NULL,
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        [acknowledged_at] datetime2(7) NULL,
        [acknowledged_by_user_id] bigint NULL,
        CONSTRAINT [PK__Guest_ar__506B71A43E98EC7A] PRIMARY KEY ([guest_arrival_alert_id])
    );
END
GO
