-- Baseline schema for dbo.Membership_fee_schedule. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Membership_fee_schedule', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Membership_fee_schedule] (
        [membership_fee_schedule_id] bigint IDENTITY(1,1) NOT NULL,
        [membership_type_id] bigint NOT NULL,
        [joining_fee] decimal(18,2) NOT NULL,
        [joining_fee_under_30] decimal(18,2) NOT NULL,
        [annual_subscription] decimal(18,2) NOT NULL,
        [effective_date] date NOT NULL,
        [is_active] bit NOT NULL CONSTRAINT [DF_fee_sched_active] DEFAULT ((1)),
        [created_at] datetime2(7) NOT NULL,
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        CONSTRAINT [PK__Membersh__77F8BAAB6A10E5BC] PRIMARY KEY ([membership_fee_schedule_id])
    );
END
GO
