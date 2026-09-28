-- Baseline schema for dbo.Accommodation_booking. This file is not executed by the application.
IF OBJECT_ID(N'dbo.Accommodation_booking', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Accommodation_booking] (
        [accommodation_booking_id] bigint IDENTITY(1,1) NOT NULL,
        [account_id] bigint NOT NULL,
        [check_in_date] date NOT NULL,
        [check_out_date] date NOT NULL,
        [room_type] nvarchar(100) NULL,
        [nightly_rate] decimal(12,2) NULL CONSTRAINT [DF__Accommoda__night__4A18FC72] DEFAULT ((0.00)),
        [cancellation_fee] decimal(12,2) NULL CONSTRAINT [DF__Accommoda__cance__4B0D20AB] DEFAULT ((0.00)),
        [vacated_by_10am_flag] bit NOT NULL CONSTRAINT [DF__Accommoda__vacat__4C0144E4] DEFAULT ((0)),
        [status] nvarchar(30) NOT NULL CONSTRAINT [DF__Accommoda__statu__4CF5691D] DEFAULT (N'BOOKED'),
        [created_at] datetime2(7) NOT NULL CONSTRAINT [DF__Accommoda__creat__4DE98D56] DEFAULT (sysutcdatetime()),
        [created_by_user_id] bigint NULL,
        [updated_by_user_id] bigint NULL,
        [updated_at] datetime2(7) NULL,
        CONSTRAINT [PK_Accommodation_booking] PRIMARY KEY ([accommodation_booking_id])
    );
END
GO
